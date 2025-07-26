# Authentication API Documentation

## Overview
The Authentication Service handles client registration, login, email verification, password management, and two-factor authentication.

## Base URL
```
http://localhost:3001/api/auth
```

## Authentication
Public endpoints do not require authentication. Protected endpoints require JWT authentication via Bearer token:
```
Authorization: Bearer <jwt_token>
```

## Public Endpoints

### Client Registration
Register a new client account.

**POST** `/client/register`

**Request Body:**
```json
{
  "email": "client@example.com",
  "password": "SecureP@ssw0rd!",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890",
  "dateOfBirth": "1990-01-15",
  "emergencyContact": {
    "name": "Jane Doe",
    "phone": "+1234567891",
    "relationship": "Spouse"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Registration successful. Please check your email to verify your account.",
  "data": {
    "clientId": "uuid",
    "userId": "uuid",
    "email": "client@example.com",
    "verificationSent": true
  }
}
```

### Client Login
Authenticate a client and receive access tokens.

**POST** `/client/login`

**Request Body:**
```json
{
  "email": "client@example.com",
  "password": "SecureP@ssw0rd!",
  "twoFactorToken": "123456" // optional, required if 2FA is enabled
}
```

**Response (without 2FA):**
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "clientId": "uuid",
    "email": "client@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "client"
  }
}
```

**Response (2FA required):**
```json
{
  "requiresTwoFactor": true,
  "tempToken": "temporary_token_for_2fa"
}
```

**Note:** Refresh token is set as an HTTP-only cookie.

### Verify Email
Verify email address using the token sent to the client's email.

**GET** `/verify-email/:token`

**Response:**
```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

### Request Password Reset
Request a password reset link to be sent to the email.

**POST** `/password-reset/request`

**Request Body:**
```json
{
  "email": "client@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "If an account exists with this email, a password reset link has been sent"
}
```

### Reset Password
Reset password using the token from the email.

**POST** `/password-reset/confirm`

**Request Body:**
```json
{
  "token": "uuid",
  "newPassword": "NewSecureP@ssw0rd!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

### Refresh Access Token
Get a new access token using the refresh token cookie.

**POST** `/refresh`

**Response:**
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

## Protected Endpoints

### Logout
Logout the current user and invalidate tokens.

**POST** `/logout`

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### Get Current User
Get the current authenticated user's information.

**GET** `/me`

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "clientId": "uuid",
    "email": "client@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+1234567890",
    "dateOfBirth": "1990-01-15",
    "emergencyContact": {
      "name": "Jane Doe",
      "phone": "+1234567891",
      "relationship": "Spouse"
    },
    "goals": "Improve fitness and flexibility",
    "preferences": {
      "preferredTime": "morning",
      "preferredDays": ["monday", "wednesday", "friday"]
    },
    "emailVerified": true,
    "twoFactorEnabled": false
  }
}
```

### Update Profile
Update the current user's profile information.

**PUT** `/profile`

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Smith",
  "phone": "+1234567890",
  "emergencyContact": {
    "name": "Jane Smith",
    "phone": "+1234567891",
    "relationship": "Spouse"
  },
  "goals": "Build muscle and improve endurance",
  "preferences": {
    "preferredTime": "evening",
    "preferredDays": ["tuesday", "thursday"]
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "user": {
    // Updated user object
  }
}
```

### Enable Two-Factor Authentication
Generate a secret and QR code for 2FA setup.

**POST** `/2fa/enable`

**Response:**
```json
{
  "success": true,
  "secret": "JBSWY3DPEHPK3PXP",
  "qrCode": "data:image/png;base64,..."
}
```

### Confirm Two-Factor Authentication
Confirm 2FA setup with a valid token.

**POST** `/2fa/confirm`

**Request Body:**
```json
{
  "token": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "2FA enabled successfully"
}
```

## Error Responses

### 400 Bad Request
```json
{
  "error": "Validation error message"
}
```

### 401 Unauthorized
```json
{
  "error": "Invalid credentials" // or "Authentication required"
}
```

### 409 Conflict
```json
{
  "error": "Email already registered"
}
```

### 429 Too Many Requests
```json
{
  "error": "Too many requests from this IP, please try again later."
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error"
}
```

## Password Requirements
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character (!@#$%^&*)

## Rate Limiting
- Registration: 100 requests per 15 minutes per IP
- Login: 5 requests per 15 minutes per IP
- Password reset: 5 requests per 15 minutes per IP
- Other endpoints: 100 requests per 15 minutes per IP

## Security Features
1. **JWT Tokens**: Access tokens expire in 15 minutes
2. **Refresh Tokens**: Stored as HTTP-only cookies, expire in 7 days
3. **Email Verification**: Required before login
4. **Two-Factor Authentication**: Optional TOTP-based 2FA
5. **Password Hashing**: bcrypt with salt rounds
6. **Rate Limiting**: Prevents brute force attacks
7. **Input Validation**: Joi-based validation for all inputs

## Integration Example

### Registration Flow
```javascript
// 1. Register
const response = await fetch('/api/auth/client/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'client@example.com',
    password: 'SecureP@ssw0rd!',
    firstName: 'John',
    lastName: 'Doe'
  })
});

// 2. User receives verification email
// 3. User clicks verification link

// 4. Login
const loginResponse = await fetch('/api/auth/client/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include', // Important for cookies
  body: JSON.stringify({
    email: 'client@example.com',
    password: 'SecureP@ssw0rd!'
  })
});

const { accessToken, user } = await loginResponse.json();

// 5. Use access token for API calls
const profileResponse = await fetch('/api/auth/me', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});
```

### Token Refresh Flow
```javascript
// When access token expires, refresh it
const refreshResponse = await fetch('/api/auth/refresh', {
  method: 'POST',
  credentials: 'include' // Send cookies
});

const { accessToken } = await refreshResponse.json();
// Update stored access token
```