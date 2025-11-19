# Admin API Documentation

Complete API reference for all admin endpoints in the Coders Cup Microfinance Backend.

## Table of Contents

1. [Authentication](#authentication)
2. [User Management](#user-management)
3. [Risk Assessment](#risk-assessment)
4. [Loan Management](#loan-management)
5. [Loan Request Management](#loan-request-management)
6. [Installment Management](#installment-management)
7. [Default Management](#default-management)
8. [Dashboard & Analytics](#dashboard--analytics)
9. [Reminder System](#reminder-system)
10. [Error Responses](#error-responses)

---

## Authentication

All admin endpoints require authentication and admin role.

**Headers Required:**
```http
Authorization: Bearer <admin_access_token>
```

**Access Control:**
- All routes under `/api/admin/*` require:
  - Valid JWT access token
  - User role must be `ADMIN`

---

## User Management

### 1. Get All Users

Retrieve a paginated list of users with optional filtering.

**Endpoint:** `GET /api/admin/users`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | No | Filter by status: `PENDING`, `APPROVED`, `REJECTED` |
| `search` | string | No | Search in fullName, email, phone, city |
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Items per page (default: 20) |

**Example Request:**
```bash
GET /api/admin/users?status=PENDING&page=1&limit=20
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "507f1f77bcf86cd799439011",
        "fullName": "John Doe",
        "email": "john@example.com",
        "phone": "+923001234567",
        "city": "Karachi",
        "province": "Sindh",
        "monthlyIncome": 50000,
        "employmentType": "SALARIED",
        "status": "PENDING",
        "createdAt": "2024-12-01T10:00:00.000Z",
        "riskLevel": "MEDIUM"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalCount": 100
    }
  }
}
```

---

### 2. Approve User

Approve a pending user account.

**Endpoint:** `PATCH /api/admin/users/:id/approve`

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | User ID |

**Example Request:**
```bash
PATCH /api/admin/users/507f1f77bcf86cd799439011/approve
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "User approved successfully",
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "status": "APPROVED",
    "approvedAt": "2024-12-28T10:30:00.000Z"
  }
}
```

**What Happens:**
- ✅ User status changed to `APPROVED`
- ✅ Approval email sent to user
- ✅ AI risk scoring triggered automatically (non-blocking)

**Error Responses:**
- `404` - User not found
- `400` - User is already approved

---

### 3. Reject User

Reject a pending user account with reason.

**Endpoint:** `PATCH /api/admin/users/:id/reject`

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | User ID |

**Request Body:**
```json
{
  "reason": "Incomplete documentation"
}
```

**Example Request:**
```bash
PATCH /api/admin/users/507f1f77bcf86cd799439011/reject
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "reason": "Incomplete documentation"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "User rejected successfully",
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "status": "REJECTED",
    "rejectionReason": "Incomplete documentation"
  }
}
```

**What Happens:**
- ✅ User status changed to `REJECTED`
- ✅ Rejection email sent to user with reason

**Error Responses:**
- `404` - User not found
- `400` - Rejection reason is required

---

## Risk Assessment

### 4. Trigger Risk Score Calculation

Manually trigger AI-powered risk assessment for a user.

**Endpoint:** `POST /api/admin/risk-score/:userId`

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `userId` | string | User ID |

**Request Body:**
```json
{
  "recalculate": true
}
```

**Body Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `recalculate` | boolean | No | Force recalculation even if exists (default: false) |

**Example Request:**
```bash
POST /api/admin/risk-score/507f1f77bcf86cd799439011
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "recalculate": true
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Risk score calculated successfully",
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "riskLevel": "MEDIUM",
    "riskScore": 65,
    "riskReasons": [
      "Moderate income level",
      "No previous loan history",
      "Stable employment type"
    ],
    "recommendedMaxLoan": 150000,
    "recommendedTenure": 24,
    "defaultProbability": 0.15,
    "calculatedAt": "2024-12-28T10:30:00.000Z"
  }
}
```

**Risk Levels:**
- `LOW` - Score 0-40 (Low risk, high approval chance)
- `MEDIUM` - Score 41-70 (Moderate risk, review carefully)
- `HIGH` - Score 71-100 (High risk, careful evaluation needed)

**Error Responses:**
- `404` - User not found
- `500` - AI service error

---

### 5. Get User Risk Profile

Retrieve detailed risk profile and loan history for a user.

**Endpoint:** `GET /api/admin/risk-profile/:userId`

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `userId` | string | User ID |

**Example Request:**
```bash
GET /api/admin/risk-profile/507f1f77bcf86cd799439011
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "user": {
      "fullName": "John Doe",
      "email": "john@example.com",
      "city": "Karachi",
      "monthlyIncome": 50000,
      "employmentType": "SALARIED"
    },
    "riskProfile": {
      "riskLevel": "MEDIUM",
      "riskScore": 65,
      "riskReasons": [
        "Moderate income level",
        "No previous loan history"
      ],
      "recommendedMaxLoan": 150000,
      "recommendedTenure": 24,
      "defaultProbability": 0.15,
      "lastCalculated": "2024-12-28T10:30:00.000Z",
      "version": 1
    },
    "loanHistory": [
      {
        "loanId": "507f1f77bcf86cd799439022",
        "amount": 100000,
        "status": "ACTIVE",
        "onTimePayments": 5,
        "latePayments": 1,
        "missedPayments": 0
      }
    ]
  }
}
```

**Error Responses:**
- `404` - User not found

---

## Loan Management

### 6. Create Loan for User

Create a new loan and generate installment schedule.

**Endpoint:** `POST /api/admin/loans/:userId`

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `userId` | string | User ID to create loan for |

**Request Body:**
```json
{
  "principalAmount": 100000,
  "interestRate": 15,
  "tenureMonths": 12,
  "startDate": "2024-12-28",
  "notes": "Business expansion loan"
}
```

**Body Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `principalAmount` | number | Yes | Loan amount in PKR |
| `interestRate` | number | Yes | Annual interest rate (percentage) |
| `tenureMonths` | number | Yes | Loan duration in months |
| `startDate` | string | Yes | Loan start date (ISO format) |
| `notes` | string | No | Additional notes |

**Example Request:**
```bash
POST /api/admin/loans/507f1f77bcf86cd799439011
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "principalAmount": 100000,
  "interestRate": 15,
  "tenureMonths": 12,
  "startDate": "2024-12-28",
  "notes": "Business expansion loan"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Loan created successfully",
  "data": {
    "loanId": "507f1f77bcf86cd799439022",
    "userId": "507f1f77bcf86cd799439011",
    "principalAmount": 100000,
    "interestRate": 15,
    "tenureMonths": 12,
    "monthlyInstallment": 9025,
    "totalAmount": 108300,
    "outstandingBalance": 108300,
    "startDate": "2024-12-28T00:00:00.000Z",
    "endDate": "2025-12-28T00:00:00.000Z",
    "status": "ACTIVE",
    "installmentSchedule": [
      {
        "month": 1,
        "dueDate": "2025-01-28T00:00:00.000Z",
        "amount": 9025,
        "gracePeriodEndDate": "2025-02-07T00:00:00.000Z"
      },
      {
        "month": 2,
        "dueDate": "2025-02-28T00:00:00.000Z",
        "amount": 9025,
        "gracePeriodEndDate": "2025-03-10T00:00:00.000Z"
      }
      // ... 10 more installments
    ]
  }
}
```

**What Happens:**
- ✅ Loan created with `ACTIVE` status
- ✅ Installment documents created (one per month)
- ✅ Grace period set to 10 days after each due date
- ✅ EMI calculated using compound interest formula
- ✅ Loan creation email sent to user

**EMI Calculation:**
```
EMI = P × r × (1 + r)^n / ((1 + r)^n - 1)

Where:
P = Principal amount
r = Monthly interest rate (annual rate / 12 / 100)
n = Number of months
```

**Error Responses:**
- `400` - Missing required fields or invalid date

---

### 7. Update Loan

Update loan notes or status.

**Endpoint:** `PUT /api/admin/loans/:loanId`

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `loanId` | string | Loan ID |

**Request Body:**
```json
{
  "notes": "Updated loan notes",
  "status": "COMPLETED"
}
```

**Body Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `notes` | string | No | Updated notes |
| `status` | string | No | New status: `ACTIVE`, `COMPLETED`, `DEFAULTED`, `CANCELLED` |

**Example Request:**
```bash
PUT /api/admin/loans/507f1f77bcf86cd799439022
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "status": "COMPLETED"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Loan updated successfully",
  "data": {
    "loanId": "507f1f77bcf86cd799439022",
    "updatedFields": ["status"]
  }
}
```

**Error Responses:**
- `404` - Loan not found

---

### 8. Get All Loans

Retrieve paginated list of loans with optional filters.

**Endpoint:** `GET /api/admin/loans`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | No | Filter by status: `ACTIVE`, `COMPLETED`, `DEFAULTED` |
| `userId` | string | No | Filter by user ID |
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Items per page (default: 20) |

**Example Request:**
```bash
GET /api/admin/loans?status=ACTIVE&page=1&limit=20
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "loans": [
      {
        "id": "507f1f77bcf86cd799439022",
        "user": {
          "id": "507f1f77bcf86cd799439011",
          "fullName": "John Doe",
          "email": "john@example.com"
        },
        "principalAmount": 100000,
        "interestRate": 15,
        "tenureMonths": 12,
        "monthlyInstallment": 9025,
        "outstandingBalance": 72200,
        "totalRepaid": 36100,
        "status": "ACTIVE",
        "startDate": "2024-12-28T00:00:00.000Z",
        "endDate": "2025-12-28T00:00:00.000Z",
        "createdAt": "2024-12-28T10:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "totalCount": 60
    }
  }
}
```

---

## Loan Request Management

### 9. Get All Loan Requests

Retrieve paginated list of loan requests from users.

**Endpoint:** `GET /api/admin/loan-requests`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | No | Filter by status: `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED` |
| `userId` | string | No | Filter by user ID |
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Items per page (default: 20) |

**Example Request:**
```bash
GET /api/admin/loan-requests?status=PENDING&page=1&limit=20
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "loanRequests": [
      {
        "id": "507f1f77bcf86cd799439033",
        "user": {
          "id": "507f1f77bcf86cd799439011",
          "fullName": "John Doe",
          "email": "john@example.com",
          "phone": "+923001234567"
        },
        "requestedAmount": 150000,
        "requestedTenure": 18,
        "purpose": "Business expansion",
        "status": "PENDING",
        "rejectionReason": null,
        "approvedAt": null,
        "rejectedAt": null,
        "loanId": null,
        "createdAt": "2024-12-28T10:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 2,
      "totalCount": 35
    }
  }
}
```

---

### 10. Approve Loan Request

Approve a loan request and automatically create loan with installments.

**Endpoint:** `POST /api/admin/loan-requests/:requestId/approve`

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `requestId` | string | Loan request ID |

**Request Body:**
```json
{
  "interestRate": 15,
  "startDate": "2024-12-28",
  "notes": "Approved after risk assessment"
}
```

**Body Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `interestRate` | number | Yes | Annual interest rate (percentage) |
| `startDate` | string | No | Loan start date (default: today) |
| `notes` | string | No | Admin notes |

**Example Request:**
```bash
POST /api/admin/loan-requests/507f1f77bcf86cd799439033/approve
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "interestRate": 15,
  "startDate": "2024-12-28"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Loan request approved and loan created successfully",
  "data": {
    "requestId": "507f1f77bcf86cd799439033",
    "loanId": "507f1f77bcf86cd799439044",
    "userId": "507f1f77bcf86cd799439011",
    "principalAmount": 150000,
    "interestRate": 15,
    "tenureMonths": 18,
    "monthlyInstallment": 9500,
    "totalAmount": 171000,
    "startDate": "2024-12-28T00:00:00.000Z",
    "endDate": "2026-06-28T00:00:00.000Z",
    "installmentsCreated": 18
  }
}
```

**What Happens:**
- ✅ Loan request status updated to `APPROVED`
- ✅ New loan created with status `ACTIVE`
- ✅ Installments generated (one per month)
- ✅ Loan approval email sent to user
- ✅ Reference to loan saved in request

**Validations:**
- User must have status `APPROVED`
- User cannot have another active loan
- User cannot have another pending loan request
- Request must be in `PENDING` status

**Error Responses:**
- `404` - Loan request not found
- `400` - Interest rate is required
- `400` - Request is not pending
- `400` - User already has active loan

---

### 11. Reject Loan Request

Reject a pending loan request with reason.

**Endpoint:** `POST /api/admin/loan-requests/:requestId/reject`

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `requestId` | string | Loan request ID |

**Request Body:**
```json
{
  "reason": "Risk score too high - HIGH risk level"
}
```

**Body Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `reason` | string | Yes | Rejection reason |

**Example Request:**
```bash
POST /api/admin/loan-requests/507f1f77bcf86cd799439033/reject
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "reason": "Risk score too high - HIGH risk level"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Loan request rejected",
  "data": {
    "requestId": "507f1f77bcf86cd799439033",
    "status": "REJECTED",
    "rejectionReason": "Risk score too high - HIGH risk level"
  }
}
```

**What Happens:**
- ✅ Request status updated to `REJECTED`
- ✅ Rejection email sent to user

**Error Responses:**
- `404` - Loan request not found
- `400` - Rejection reason is required
- `400` - Request is not pending

---

## Installment Management

### 12. Get All Installments

Retrieve paginated list of installments with filters.

**Endpoint:** `GET /api/admin/installments`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | No | Filter: `PENDING`, `PAID`, `OVERDUE`, `DEFAULTED` |
| `userId` | string | No | Filter by user ID |
| `loanId` | string | No | Filter by loan ID |
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Items per page (default: 20, max: 50) |

**Example Request:**
```bash
GET /api/admin/installments?status=OVERDUE&page=1&limit=50
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "installments": [
      {
        "id": "507f1f77bcf86cd799439055",
        "loan": {
          "id": "507f1f77bcf86cd799439022",
          "principalAmount": 100000
        },
        "user": {
          "id": "507f1f77bcf86cd799439011",
          "fullName": "John Doe",
          "email": "john@example.com",
          "phone": "+923001234567"
        },
        "installmentNumber": 5,
        "amount": 9025,
        "fineAmount": 270,
        "totalDue": 9295,
        "dueDate": "2025-05-28T00:00:00.000Z",
        "paidDate": null,
        "status": "OVERDUE",
        "daysOverdue": 3
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 4,
      "totalCount": 180
    }
  }
}
```

**Installment Status:**
- `PENDING` - Not yet due or within grace period
- `PAID` - Payment completed
- `OVERDUE` - Past grace period, not paid
- `DEFAULTED` - Severe default (multiple overdue)

**Fine Calculation:**
- Daily fine rate: 1% of installment amount
- Maximum fine: 10% of installment amount
- Calculated from grace period end date

---

### 13. Waive Fine

Waive late payment fine for an installment.

**Endpoint:** `POST /api/admin/waive-fine/:installmentId`

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `installmentId` | string | Installment ID |

**Request Body:**
```json
{
  "reason": "First-time late payment, customer has good history"
}
```

**Body Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `reason` | string | Yes | Reason for waiving fine |

**Example Request:**
```bash
POST /api/admin/waive-fine/507f1f77bcf86cd799439055
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "reason": "First-time late payment, customer has good history"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Fine waived successfully",
  "data": {
    "installmentId": "507f1f77bcf86cd799439055",
    "oldFineAmount": 270,
    "newFineAmount": 0,
    "waivedBy": "507f1f77bcf86cd799439001",
    "reason": "First-time late payment, customer has good history"
  }
}
```

**What Happens:**
- ✅ Fine amount set to 0
- ✅ Total due updated (amount only, no fine)
- ✅ Admin ID recorded as waiver authority

**Error Responses:**
- `404` - Installment not found
- `400` - Reason is required

---

## Default Management

### 14. Get Defaulted Loans

Retrieve all loans marked as defaulted with analytics.

**Endpoint:** `GET /api/admin/defaults`

**Example Request:**
```bash
GET /api/admin/defaults
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "defaultedLoans": [
      {
        "id": "507f1f77bcf86cd799439066",
        "user": {
          "id": "507f1f77bcf86cd799439012",
          "fullName": "Jane Smith",
          "email": "jane@example.com",
          "phone": "+923001234568",
          "riskLevel": "HIGH"
        },
        "principalAmount": 200000,
        "outstandingBalance": 150000,
        "totalFines": 15000,
        "defaultedAt": "2024-11-15T00:00:00.000Z",
        "daysInDefault": 43,
        "missedInstallments": 0,
        "aiPredictedDefault": false,
        "recoveryProbability": null
      }
    ],
    "summary": {
      "totalDefaulted": 8,
      "totalOutstanding": 1250000,
      "averageDefaultTime": 35.5
    }
  }
}
```

**Default Criteria:**
Loan is marked as defaulted when:
- Multiple consecutive installments missed
- Severe overdue status
- Manual admin action

---

## Dashboard & Analytics

### 15. Get Dashboard Statistics

Retrieve comprehensive dashboard statistics.

**Endpoint:** `GET /api/admin/dashboard/stats`

**Example Request:**
```bash
GET /api/admin/dashboard/stats
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "users": {
      "total": 1250,
      "pending": 45,
      "approved": 1180,
      "rejected": 25
    },
    "loans": {
      "total": 856,
      "active": 520,
      "completed": 310,
      "defaulted": 26,
      "totalDisbursed": 85600000,
      "totalCollected": 62400000,
      "totalOutstanding": 23200000
    },
    "installments": {
      "pending": 1250,
      "overdue": 85,
      "defaulted": 12,
      "dueThisMonth": 340,
      "expectedCollection": 3060000
    },
    "risk": {
      "lowRisk": 720,
      "mediumRisk": 380,
      "highRisk": 80,
      "aiPredictedDefaults": 0
    },
    "recentActivity": [
      {
        "type": "PAYMENT",
        "description": "Payment success for installment 507f1f77bcf86cd799439077",
        "timestamp": "2024-12-28T14:25:00.000Z"
      },
      {
        "type": "PAYMENT",
        "description": "Payment success for installment 507f1f77bcf86cd799439078",
        "timestamp": "2024-12-28T14:20:00.000Z"
      }
    ]
  }
}
```

**Use Cases:**
- Display admin dashboard overview
- Monitor portfolio health
- Track collection metrics
- Identify risk distribution

---

## Reminder System

### 16. Trigger Installment Reminders

Manually trigger reminder emails for installments due in 3 days.

**Endpoint:** `POST /api/admin/reminders/installments`

**Example Request:**
```bash
POST /api/admin/reminders/installments
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Installment reminder job triggered successfully. Emails will be sent in the background."
}
```

**What Happens:**
1. ✅ Finds installments due within 3 days
2. ✅ Filters by reminder limits (max 3 reminders)
3. ✅ Filters by time between reminders (min 24 hours)
4. ✅ Creates Stripe payment session for each installment
5. ✅ Sends email with payment URL button
6. ✅ Updates reminder tracking (remindersSent, lastReminderSent)

**Reminder Email Includes:**
- Installment number
- Amount due
- Due date
- Days until due
- **Green "Pay Now with Stripe" button** (direct payment link)

**Automatic Schedule:**
- Runs daily at 9:00 AM server time

---

### 17. Trigger Overdue Notices

Manually trigger overdue notices for installments past grace period.

**Endpoint:** `POST /api/admin/reminders/overdue`

**Example Request:**
```bash
POST /api/admin/reminders/overdue
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Overdue notice job triggered successfully. Emails will be sent in the background."
}
```

**What Happens:**
1. ✅ Finds installments past grace period
2. ✅ Updates status to `OVERDUE`
3. ✅ Calculates fines (1% per day, max 10%)
4. ✅ Creates Stripe payment session
5. ✅ Sends urgent email with payment URL
6. ✅ Updates installment with fine and days overdue

**Overdue Email Includes:**
- Installment number
- Original amount
- Fine amount (calculated)
- Total due (amount + fine)
- Days overdue
- **Red "Pay Now with Stripe" button** (urgent payment link)

**Fine Calculation:**
```
Daily fine rate: 1% of installment amount
Maximum fine: 10% of installment amount
Fine = min(days_overdue × 0.01 × amount, amount × 0.10)
```

**Automatic Schedule:**
- Runs daily at 10:00 AM server time

---

## Error Responses

### Standard Error Format

All errors follow this structure:

```json
{
  "success": false,
  "message": "Error description"
}
```

### Common HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| `200` | OK | Request succeeded |
| `201` | Created | Resource created successfully |
| `400` | Bad Request | Invalid input or validation error |
| `401` | Unauthorized | Missing or invalid token |
| `403` | Forbidden | Not admin role |
| `404` | Not Found | Resource doesn't exist |
| `500` | Server Error | Internal server error |

### Common Error Messages

**Authentication Errors:**
```json
{
  "success": false,
  "message": "No token provided"
}
```

```json
{
  "success": false,
  "message": "Invalid or expired token"
}
```

```json
{
  "success": false,
  "message": "Access denied. Admin privileges required."
}
```

**Validation Errors:**
```json
{
  "success": false,
  "message": "Missing required fields"
}
```

```json
{
  "success": false,
  "message": "Invalid date format"
}
```

**Business Logic Errors:**
```json
{
  "success": false,
  "message": "User already has an active loan"
}
```

```json
{
  "success": false,
  "message": "Loan request is already approved"
}
```

---

## Quick Reference

### Complete Admin Endpoint List

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/users` | List all users |
| `PATCH` | `/api/admin/users/:id/approve` | Approve user |
| `PATCH` | `/api/admin/users/:id/reject` | Reject user |
| `POST` | `/api/admin/risk-score/:userId` | Calculate risk score |
| `GET` | `/api/admin/risk-profile/:userId` | Get risk profile |
| `POST` | `/api/admin/loans/:userId` | Create loan |
| `PUT` | `/api/admin/loans/:loanId` | Update loan |
| `GET` | `/api/admin/loans` | List all loans |
| `GET` | `/api/admin/installments` | List all installments |
| `GET` | `/api/admin/defaults` | List defaulted loans |
| `GET` | `/api/admin/dashboard/stats` | Get dashboard stats |
| `POST` | `/api/admin/waive-fine/:installmentId` | Waive fine |
| `GET` | `/api/admin/loan-requests` | List loan requests |
| `POST` | `/api/admin/loan-requests/:requestId/approve` | Approve request |
| `POST` | `/api/admin/loan-requests/:requestId/reject` | Reject request |
| `POST` | `/api/admin/reminders/installments` | Trigger reminders |
| `POST` | `/api/admin/reminders/overdue` | Trigger overdue notices |

---

## Testing with cURL

### Example Test Flow

```bash
# 1. Login as admin
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@codercup.com",
    "password": "Admin@123"
  }'

# Save the access token from response

# 2. Get pending users
curl -X GET "http://localhost:5000/api/admin/users?status=PENDING" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 3. Approve a user
curl -X PATCH http://localhost:5000/api/admin/users/USER_ID/approve \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 4. Get loan requests
curl -X GET "http://localhost:5000/api/admin/loan-requests?status=PENDING" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 5. Approve loan request
curl -X POST http://localhost:5000/api/admin/loan-requests/REQUEST_ID/approve \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "interestRate": 15,
    "startDate": "2024-12-28"
  }'

# 6. Trigger reminders
curl -X POST http://localhost:5000/api/admin/reminders/installments \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 7. Get dashboard stats
curl -X GET http://localhost:5000/api/admin/dashboard/stats \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Best Practices

### Security
- ✅ Always use HTTPS in production
- ✅ Keep access tokens secure
- ✅ Tokens expire after 15 minutes
- ✅ Use refresh tokens for extended sessions
- ✅ Never share admin credentials

### Performance
- ✅ Use pagination for large datasets
- ✅ Add filters to reduce response size
- ✅ Cache dashboard stats when possible
- ✅ Use background jobs for bulk operations

### Error Handling
- ✅ Always check `success` field in response
- ✅ Handle 401/403 by redirecting to login
- ✅ Display user-friendly error messages
- ✅ Log errors for debugging

### Workflow
1. **User Management**: Approve/reject → Trigger risk score
2. **Loan Requests**: Review request → Check risk profile → Approve with terms
3. **Monitoring**: Check dashboard → View overdue → Trigger reminders
4. **Default Management**: Review defaults → Waive fines if justified

---

## Support & Documentation

- **Backend Repository**: [GitHub - Coders-Cup-Hackathon-Backend](https://github.com/owaisrafiq05/Coders-Cup-Hackathon-Backend)
- **Additional Docs**:
  - [LOAN_REQUEST_WORKFLOW.md](./LOAN_REQUEST_WORKFLOW.md)
  - [REMINDER_SYSTEM_DOCS.md](./REMINDER_SYSTEM_DOCS.md)
  - [PAYMENT_URL_INTEGRATION.md](./PAYMENT_URL_INTEGRATION.md)
  - [API_ENDPOINTS_REFERENCE.md](./API_ENDPOINTS_REFERENCE.md)

---

## Changelog

**Version 1.0** (December 2024)
- Initial admin API documentation
- All 17 admin endpoints documented
- Payment URL integration in reminder emails
- Complete testing examples included

---

*Last Updated: December 28, 2024*
