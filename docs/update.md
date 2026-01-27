# Migration Guide: Standalone → Uploader API Refactoring

**Date:** 2026-01-26  
**Status:** Completed

## Overview

This document outlines the refactoring of the "Standalone" uploader API to use more generalized naming conventions. The changes improve code organization by:

1. Separating general HMAC authentication from uploader-specific routes
2. Renaming "standalone" to "uploader" for clarity
3. Renaming "referral" endpoints to "manage" for better semantic meaning

## Changes Summary

### Routes

#### New Files

-   **`routes/api/auth.php`** - General HMAC authentication endpoints (token exchange)

#### Renamed Files

-   `routes/api/standalone.php` → `routes/api/uploader.php`

#### Route Prefixes

| Old Route                                | New Route                            | Purpose                                     |
| ---------------------------------------- | ------------------------------------ | ------------------------------------------- |
| `POST /api/standalone/auth/exchange`     | `POST /api/auth/exchange`            | HMAC token exchange (moved to general auth) |
| `GET /api/standalone/config`             | `GET /api/uploader/config`           | Get uploader configuration                  |
| `GET /api/standalone/signature`          | `GET /api/uploader/signature`        | Get upload signature                        |
| `POST /api/standalone/upload/init`       | `POST /api/uploader/upload/init`     | Initialize upload                           |
| `POST /api/standalone/upload/start`      | `POST /api/uploader/upload/start`    | Start upload                                |
| `POST /api/standalone/upload/complete`   | `POST /api/uploader/upload/complete` | Complete upload                             |
| `POST /api/standalone/upload/error`      | `POST /api/uploader/upload/error`    | Report upload error                         |
| `POST /api/standalone/upload/cancel`     | `POST /api/uploader/upload/cancel`   | Cancel upload                               |
| `POST /api/standalone/referral/submit`   | `POST /api/uploader/manage/submit`   | Submit upload for processing                |
| `POST /api/standalone/referral/withdraw` | `POST /api/uploader/manage/withdraw` | Withdraw upload                             |

#
### Documentation

#### Updated Files

-   `docs/api/standalone-uploader-api.md` - Complete API documentation (all routes updated)
-   `docs/api/standalone-uploader-quick-reference.md` - Quick reference guide (all routes updated)
-   `docs/api/README.md` - API directory overview

#### Changes Made

-   All endpoint URLs updated to new paths
-   Route names updated throughout
-   Code examples updated with new paths
-   Authentication flow diagrams updated

---

## Migration Steps for API Consumers

### 1. Update Authentication Endpoint

**Old:**

```typescript
POST https://aura.example.com/api/standalone/auth/exchange
```

**New:**

```typescript
POST https://aura.example.com/api/auth/exchange
```

### 2. Update Uploader Endpoints

Replace `standalone` with `uploader` in all URLs:

**Old:**

```typescript
GET / api / standalone / config;
GET / api / standalone / signature;
POST / api / standalone / upload / init;
POST / api / standalone / upload / start;
POST / api / standalone / upload / complete;
POST / api / standalone / upload / error;
POST / api / standalone / upload / cancel;
```

**New:**

```typescript
GET / api / uploader / config;
GET / api / uploader / signature;
POST / api / uploader / upload / init;
POST / api / uploader / upload / start;
POST / api / uploader / upload / complete;
POST / api / uploader / upload / error;
POST / api / uploader / upload / cancel;
```

### 3. Update Management Endpoints

Replace `standalone/referral` with `uploader/manage`:

**Old:**

```typescript
POST / api / standalone / referral / submit;
POST / api / standalone / referral / withdraw;
```

**New:**

```typescript
POST / api / uploader / manage / submit;
POST / api / uploader / manage / withdraw;
```

### 4. Update Route References (Laravel apps)

If using named routes:

**Old:**

```php
route('api.standalone.upload.init')
route('api.standalone.referral.submit')
```

**New:**

```php
route('api.uploader.upload.init')
route('api.uploader.manage.submit')
```

---

## Code Changes Required

### For External Integrations

If you're consuming the API:

1. **Update base URLs** in your configuration
2. **Update endpoint paths** in API client code
3. **Test thoroughly** in development environment
4. **Deploy gradually** with feature flags if possible
