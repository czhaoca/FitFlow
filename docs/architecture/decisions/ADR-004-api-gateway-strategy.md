# ADR-004: API Gateway Strategy

## Status
Accepted

## Context
FitFlow's microservices architecture requires a solution for:
- Service-to-service communication
- Centralized authentication/authorization
- Request routing and load balancing
- Monitoring and tracing
- API versioning

Current state has direct HTTP calls between services with no central control point.

## Decision
We will implement a **Custom API Gateway** for better control, readability, and gradual scaling.

## Rationale

### Options Considered

1. **Kong API Gateway**
   - Mature, feature-rich solution
   - Additional infrastructure to manage
   - Learning curve for configuration

2. **Service Mesh (Istio)**
   - Advanced traffic management
   - High complexity for small team
   - Overkill for current scale

3. **Custom API Gateway** ✅ **SELECTED**
   - Human-readable code
   - Start simple, evolve as needed
   - Full control over implementation
   - No external dependencies

### Key Decision Factors

1. **Human Readable**: Team prefers code they can read and understand over configuration files.

2. **Low Initial Volume**: Expected 100-200 requests/second doesn't justify complex infrastructure.

3. **Gradual Complexity**: Can start with basic routing and add features as needed.

4. **Strong Consistency**: Appointments and payments require synchronous communication.

5. **Limited Experience**: Team has limited experience with service mesh technologies.

## Consequences

### Positive
- Complete control over routing logic
- Easy to debug and modify
- No additional infrastructure
- Can evolve with requirements
- Team can understand entire codebase

### Negative
- Need to implement common features ourselves
- May need to migrate to commercial solution later
- Less battle-tested than established solutions

## Implementation Details

### Core Gateway Implementation
```javascript
class APIGateway {
  constructor() {
    this.routes = new Map();
    this.middleware = [];
    this.services = {
      auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
      payment: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3002',
      notification: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3003',
      appointment: process.env.APPOINTMENT_SERVICE_URL || 'http://localhost:3004'
    };
  }

  // Register routes with metadata
  registerRoutes() {
    // Auth routes
    this.addRoute('POST', '/api/auth/login', 'auth', { 
      requiresAuth: false,
      rateLimit: 5, // per minute
      timeout: 5000
    });
    
    this.addRoute('POST', '/api/auth/refresh', 'auth', {
      requiresAuth: false,
      rateLimit: 10
    });
    
    // Appointment routes
    this.addRoute('GET', '/api/appointments', 'appointment', {
      requiresAuth: true,
      cache: false, // Real-time data
      requiredRole: ['trainer', 'client', 'admin']
    });
    
    this.addRoute('POST', '/api/appointments', 'appointment', {
      requiresAuth: true,
      requiredRole: ['trainer', 'admin'],
      validateSchema: 'createAppointment'
    });
    
    // Payment routes
    this.addRoute('POST', '/api/payments', 'payment', {
      requiresAuth: true,
      requiredRole: ['client'],
      idempotent: true,
      timeout: 30000 // Payment processing needs more time
    });
  }

  addRoute(method, path, service, options = {}) {
    const key = `${method}:${path}`;
    this.routes.set(key, {
      service,
      method,
      path,
      ...options
    });
  }

  // Main request handler
  async handleRequest(req, res) {
    const startTime = Date.now();
    const routeKey = `${req.method}:${req.path}`;
    const route = this.matchRoute(routeKey);
    
    if (!route) {
      return res.status(404).json({ 
        error: 'Route not found',
        path: req.path,
        method: req.method
      });
    }
    
    try {
      // Execute middleware pipeline
      const context = { req, res, route, startTime };
      for (const mw of this.middleware) {
        const result = await mw(context);
        if (result === false) return; // Middleware handled response
      }
      
      // Forward to service
      const serviceUrl = this.services[route.service];
      const response = await this.forwardRequest(
        serviceUrl, 
        req, 
        route
      );
      
      // Log successful request
      this.logRequest(context, response.status);
      
      // Return response
      res.status(response.status).json(response.data);
      
    } catch (error) {
      this.handleError(error, res, route);
    }
  }

  async forwardRequest(serviceUrl, req, route) {
    const timeout = route.timeout || 10000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(`${serviceUrl}${req.path}`, {
        method: req.method,
        headers: {
          ...req.headers,
          'X-Gateway-Request-ID': req.id,
          'X-Tenant-ID': req.tenantId,
          'X-User-ID': req.userId,
          'X-User-Roles': JSON.stringify(req.userRoles)
        },
        body: req.body ? JSON.stringify(req.body) : undefined,
        signal: controller.signal
      });
      
      const data = await response.json();
      return { status: response.status, data };
      
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Pattern matching for dynamic routes
  matchRoute(routeKey) {
    // Exact match
    if (this.routes.has(routeKey)) {
      return this.routes.get(routeKey);
    }
    
    // Pattern matching for dynamic segments
    for (const [pattern, route] of this.routes) {
      const regex = pattern.replace(/:[^/]+/g, '([^/]+)');
      if (new RegExp(`^${regex}$`).test(routeKey)) {
        return route;
      }
    }
    
    return null;
  }
}
```

### Middleware System
```javascript
// Authentication middleware
const authMiddleware = async (context) => {
  const { req, route } = context;
  
  if (!route.requiresAuth) return true;
  
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    context.res.status(401).json({ error: 'No token provided' });
    return false;
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.userRoles = decoded.roles;
    req.tenantId = decoded.tenantId;
    return true;
  } catch (error) {
    context.res.status(401).json({ error: 'Invalid token' });
    return false;
  }
};

// Rate limiting middleware
const rateLimitMiddleware = async (context) => {
  const { req, route } = context;
  const limit = route.rateLimit;
  
  if (!limit) return true;
  
  const key = `rate:${req.ip}:${route.path}`;
  const count = await redis.incr(key);
  
  if (count === 1) {
    await redis.expire(key, 60); // 1 minute window
  }
  
  if (count > limit) {
    context.res.status(429).json({ 
      error: 'Rate limit exceeded',
      retryAfter: 60
    });
    return false;
  }
  
  return true;
};

// Request validation middleware
const validationMiddleware = async (context) => {
  const { req, route } = context;
  
  if (!route.validateSchema) return true;
  
  const schema = schemas[route.validateSchema];
  const { error } = schema.validate(req.body);
  
  if (error) {
    context.res.status(400).json({ 
      error: 'Validation failed',
      details: error.details
    });
    return false;
  }
  
  return true;
};
```

### Service Registry
```javascript
// Simple service registry for health checks
class ServiceRegistry {
  constructor() {
    this.services = new Map();
    this.healthCheckInterval = 30000; // 30 seconds
  }

  register(name, url, healthPath = '/health') {
    this.services.set(name, {
      url,
      healthPath,
      status: 'unknown',
      lastCheck: null
    });
  }

  async checkHealth() {
    for (const [name, service] of this.services) {
      try {
        const response = await fetch(
          `${service.url}${service.healthPath}`,
          { timeout: 5000 }
        );
        
        service.status = response.ok ? 'healthy' : 'unhealthy';
        service.lastCheck = new Date();
      } catch (error) {
        service.status = 'unreachable';
        service.lastCheck = new Date();
      }
    }
  }

  getHealthyService(name) {
    const service = this.services.get(name);
    if (service?.status === 'healthy') {
      return service.url;
    }
    throw new Error(`Service ${name} is not healthy`);
  }
}
```

### Usage Example
```javascript
// Initialize gateway
const gateway = new APIGateway();
gateway.registerRoutes();

// Add middleware
gateway.middleware.push(
  correlationIdMiddleware,
  loggingMiddleware,
  authMiddleware,
  rateLimitMiddleware,
  validationMiddleware,
  tenantIsolationMiddleware
);

// Express integration
app.all('/api/*', (req, res) => {
  gateway.handleRequest(req, res);
});

// Health endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    services: registry.getServiceStatuses(),
    uptime: process.uptime()
  });
});
```

## Future Enhancements

1. **Circuit Breaker**: Add circuit breaker pattern for failing services
2. **Request Retries**: Implement intelligent retry logic
3. **Response Caching**: Add caching for appropriate endpoints
4. **WebSocket Support**: Proxy WebSocket connections
5. **GraphQL Gateway**: Add GraphQL aggregation layer
6. **Service Discovery**: Integrate with service discovery mechanism

## Migration Path

If we need to migrate to a commercial solution:

1. **Kong Migration**:
   - Export route definitions to Kong config
   - Migrate middleware to Kong plugins
   - Gradual service-by-service migration

2. **Service Mesh Migration**:
   - Deploy Istio/Linkerd alongside custom gateway
   - Gradually move traffic management to mesh
   - Retire custom gateway once stable

## References
- [API Gateway Pattern](https://microservices.io/patterns/apigateway.html)
- [Node.js HTTP Proxy](https://github.com/http-party/node-http-proxy)
- Original discussion: `/work/FitFlow/docs/architecture/architectural-review-discussion.md`