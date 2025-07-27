# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records (ADRs) for the FitFlow project. ADRs document important architectural decisions made during the project's development.

## What is an ADR?

An Architecture Decision Record captures an important architectural decision made along with its context and consequences. ADRs help future developers understand why certain choices were made.

## ADR Status

- **Draft**: Under discussion
- **Proposed**: Ready for review
- **Accepted**: Decision approved and implemented
- **Deprecated**: No longer relevant
- **Superseded**: Replaced by another ADR

## Current ADRs

| ADR | Title | Status | Date | Summary |
|-----|-------|--------|------|---------|
| [ADR-001](ADR-001-multitenancy-strategy.md) | Multi-Tenancy Strategy | Accepted | 2025-07-27 | Shared Tables with Tenant ID approach for multi-studio support |
| [ADR-002](ADR-002-database-platform.md) | Database Platform Selection | Accepted | 2025-07-27 | MySQL HeatWave for cloud portability and no vendor lock-in |
| [ADR-003](ADR-003-encryption-strategy.md) | Field-Level Encryption Strategy | Accepted | 2025-07-27 | Application-level encryption for sensitive data fields |
| [ADR-004](ADR-004-api-gateway-strategy.md) | API Gateway Strategy | Accepted | 2025-07-27 | Custom API Gateway for better control and readability |
| [ADR-005](ADR-005-caching-strategy.md) | Caching Strategy | Accepted | 2025-07-27 | Smart caching with data-specific TTLs |
| [ADR-006](ADR-006-payment-architecture.md) | Payment Processing Architecture | Accepted | 2025-07-27 | Abstraction layer supporting Stripe + Interac e-Transfer |
| [ADR-007](ADR-007-event-architecture.md) | Event-Driven Architecture Strategy | Accepted | 2025-07-27 | Defer implementation; use synchronous with future-ready stubs |

## Template

When creating a new ADR, use this template:

```markdown
# ADR-XXX: Title

## Status
[Draft | Proposed | Accepted | Deprecated | Superseded]

## Context
What is the issue that we're seeing that is motivating this decision?

## Decision
What is the change that we're proposing and/or doing?

## Rationale
Why is this the right decision?

## Consequences
What becomes easier or more difficult to do because of this change?

## References
Links to related documents, discussions, or external resources.
```

## How to Create a New ADR

1. Copy the template above
2. Create a new file named `ADR-XXX-brief-description.md`
3. Fill in all sections
4. Submit for review
5. Update this README with the new ADR entry

## Related Documents

- [Architectural Review Discussion](/docs/architecture/architectural-review-discussion.md)
- [System Design](/docs/architecture/system-design.md)
- [Technical Specifications](/docs/architecture/technical-specifications.md)