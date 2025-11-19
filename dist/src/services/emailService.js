"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailService = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const logger_1 = __importDefault(require("../utils/logger"));
const EmailLog_1 = __importStar(require("../models/EmailLog"));
class EmailService {
    constructor() {
        // Initialize nodemailer transporter
        this.transporter = nodemailer_1.default.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
        // Verify transporter configuration
        this.verifyConnection();
    }
    async verifyConnection() {
        try {
            await this.transporter.verify();
            logger_1.default.info('Email service is ready');
        }
        catch (error) {
            logger_1.default.error('Email service configuration error', { error: error.message });
        }
    }
    /**
     * Send email with automatic logging
     */
    async sendEmail(options) {
        try {
            // Send email
            const info = await this.transporter.sendMail({
                from: `"Coders Cup Microfinance" <${process.env.SMTP_USER}>`,
                to: options.to,
                subject: options.subject,
                html: options.html,
                text: options.text || this.stripHtml(options.html),
            });
            // Log successful email
            await EmailLog_1.default.create({
                userId: options.userId,
                recipientEmail: options.to,
                emailType: options.emailType,
                subject: options.subject,
                body: options.html,
                status: EmailLog_1.EmailStatus.SENT,
                provider: 'gmail',
                providerMessageId: info.messageId,
                sentAt: new Date(),
                metadata: options.metadata || {},
            });
            logger_1.default.info('Email sent successfully', {
                to: options.to,
                type: options.emailType,
                messageId: info.messageId,
            });
            return true;
        }
        catch (error) {
            // Log failed email
            await EmailLog_1.default.create({
                userId: options.userId,
                recipientEmail: options.to,
                emailType: options.emailType,
                subject: options.subject,
                body: options.html,
                status: EmailLog_1.EmailStatus.FAILED,
                provider: 'gmail',
                errorMessage: error.message,
                metadata: options.metadata || {},
            });
            logger_1.default.error('Failed to send email', {
                to: options.to,
                type: options.emailType,
                error: error.message,
            });
            return false;
        }
    }
    /**
     * Strip HTML tags for plain text
     */
    stripHtml(html) {
        return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }
    /**
     * Send OTP email
     */
    async sendOTP(email, data, userId) {
        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 5px; margin-top: 20px; }
          .otp-code { font-size: 32px; font-weight: bold; color: #4CAF50; text-align: center; padding: 20px; background: white; border-radius: 5px; margin: 20px 0; letter-spacing: 5px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Verification Code</h1>
          </div>
          <div class="content">
            <p>Hello ${data.userName},</p>
            <p>Your verification code is:</p>
            <div class="otp-code">${data.otpCode}</div>
            <p>This code will expire in <strong>${data.expiryMinutes} minutes</strong>.</p>
            <p>If you didn't request this code, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>© 2025 Coders Cup Microfinance. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
        return this.sendEmail({
            to: email,
            subject: 'Your Verification Code',
            html,
            userId,
            emailType: EmailLog_1.EmailType.OTHER,
            metadata: { expiryMinutes: data.expiryMinutes },
        });
    }
    /**
     * Send welcome/registration confirmation email
     */
    async sendWelcome(email, data, userId) {
        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 5px; margin-top: 20px; }
          .info-box { background: white; padding: 15px; border-left: 4px solid #4CAF50; margin: 15px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to Coders Cup Microfinance</h1>
          </div>
          <div class="content">
            <p>Hello ${data.userName},</p>
            <p>Thank you for registering with Coders Cup Microfinance! Your account has been created successfully.</p>
            <div class="info-box">
              <strong>Email:</strong> ${data.email}
            </div>
            <p>Your account is currently <strong>pending approval</strong>. Our team will review your application and notify you once it's approved.</p>
            <p>This process typically takes 1-2 business days.</p>
            <p>If you have any questions, feel free to contact our support team.</p>
          </div>
          <div class="footer">
            <p>© 2025 Coders Cup Microfinance. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
        return this.sendEmail({
            to: email,
            subject: 'Welcome to Coders Cup Microfinance',
            html,
            userId,
            emailType: EmailLog_1.EmailType.REGISTRATION_CONFIRMATION,
        });
    }
    /**
     * Send account approved email
     */
    async sendAccountApproved(email, data, userId) {
        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 5px; margin-top: 20px; }
          .success-badge { background: #4CAF50; color: white; padding: 10px 20px; border-radius: 20px; display: inline-block; margin: 15px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Account Approved!</h1>
          </div>
          <div class="content">
            <p>Hello ${data.userName},</p>
            <div class="success-badge">✓ Your account has been approved</div>
            <p>Congratulations! Your account has been approved on ${data.approvalDate}.</p>
            <p>You can now:</p>
            <ul>
              <li>Apply for microfinance loans</li>
              <li>View your loan history</li>
              <li>Make payments</li>
              <li>Access all platform features</li>
            </ul>
            <p>Login to your account to get started!</p>
          </div>
          <div class="footer">
            <p>© 2025 Coders Cup Microfinance. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
        return this.sendEmail({
            to: email,
            subject: 'Your Account Has Been Approved',
            html,
            userId,
            emailType: EmailLog_1.EmailType.ACCOUNT_APPROVED,
            metadata: { approvalDate: data.approvalDate },
        });
    }
    /**
     * Send account rejected email
     */
    async sendAccountRejected(email, data, userId) {
        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f44336; color: white; padding: 20px; text-align: center; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 5px; margin-top: 20px; }
          .reason-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 15px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Account Application Update</h1>
          </div>
          <div class="content">
            <p>Hello ${data.userName},</p>
            <p>Thank you for your interest in Coders Cup Microfinance.</p>
            <p>Unfortunately, we are unable to approve your account at this time.</p>
            <div class="reason-box">
              <strong>Reason:</strong><br>
              ${data.reason}
            </div>
            <p>If you believe this decision was made in error or if you have additional information to provide, please contact our support team.</p>
          </div>
          <div class="footer">
            <p>© 2025 Coders Cup Microfinance. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
        return this.sendEmail({
            to: email,
            subject: 'Account Application Status',
            html,
            userId,
            emailType: EmailLog_1.EmailType.ACCOUNT_REJECTED,
            metadata: { reason: data.reason },
        });
    }
    /**
     * Send loan created email
     */
    async sendLoanCreated(email, data, userId) {
        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2196F3; color: white; padding: 20px; text-align: center; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 5px; margin-top: 20px; }
          .loan-details { background: white; padding: 20px; border-radius: 5px; margin: 15px 0; }
          .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
          .detail-row:last-child { border-bottom: none; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Loan Approved & Created</h1>
          </div>
          <div class="content">
            <p>Hello ${data.userName},</p>
            <p>Great news! Your loan has been approved and created successfully.</p>
            <div class="loan-details">
              <h3>Loan Details:</h3>
              <div class="detail-row">
                <span>Loan Amount:</span>
                <strong>PKR ${data.loanAmount.toLocaleString()}</strong>
              </div>
              <div class="detail-row">
                <span>Interest Rate:</span>
                <strong>${data.interestRate}% per annum</strong>
              </div>
              <div class="detail-row">
                <span>Tenure:</span>
                <strong>${data.tenureMonths} months</strong>
              </div>
              <div class="detail-row">
                <span>Monthly Installment:</span>
                <strong>PKR ${data.monthlyInstallment.toLocaleString()}</strong>
              </div>
              <div class="detail-row">
                <span>First Payment Due:</span>
                <strong>${data.firstPaymentDate}</strong>
              </div>
            </div>
            <p>Please ensure timely payments to maintain a good credit history.</p>
          </div>
          <div class="footer">
            <p>© 2025 Coders Cup Microfinance. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
        return this.sendEmail({
            to: email,
            subject: 'Loan Approved - Details Inside',
            html,
            userId,
            emailType: EmailLog_1.EmailType.LOAN_CREATED,
            metadata: {
                loanAmount: data.loanAmount,
                tenureMonths: data.tenureMonths,
            },
        });
    }
    /**
     * Send loan request processing email
     */
    async sendLoanRequestProcessing(email, data, userId) {
        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2196F3; color: white; padding: 20px; text-align: center; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 5px; margin-top: 20px; }
          .request-box { background: white; padding: 20px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #2196F3; }
          .detail-row { padding: 8px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Loan Request Received</h1>
          </div>
          <div class="content">
            <p>Hello ${data.userName},</p>
            <p>We have received your loan request and it is now being processed by our team.</p>
            <div class="request-box">
              <h3>Request Details:</h3>
              <div class="detail-row">
                <strong>Requested Amount:</strong> PKR ${data.requestedAmount.toLocaleString()}
              </div>
              <div class="detail-row">
                <strong>Requested Tenure:</strong> ${data.requestedTenure} months
              </div>
              <div class="detail-row">
                <strong>Request Date:</strong> ${data.requestDate}
              </div>
            </div>
            <p><strong>What happens next?</strong></p>
            <ul>
              <li>Our team will review your application</li>
              <li>We'll assess your eligibility based on your profile</li>
              <li>You'll receive a notification once your loan is approved or if we need additional information</li>
            </ul>
            <p>This process typically takes 1-2 business days.</p>
            <p>Thank you for choosing our microfinance services!</p>
          </div>
          <div class="footer">
            <p>© 2025 Coders Cup Microfinance. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
        return this.sendEmail({
            to: email,
            subject: 'Loan Request Received - Under Processing',
            html,
            userId,
            emailType: EmailLog_1.EmailType.LOAN_CREATED,
            metadata: {
                requestedAmount: data.requestedAmount,
                requestedTenure: data.requestedTenure,
            },
        });
    }
    /**
     * Send loan approved email (separate from loan creation)
     */
    async sendLoanApproved(email, data, userId) {
        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 5px; margin-top: 20px; }
          .loan-details { background: white; padding: 20px; border-radius: 5px; margin: 15px 0; }
          .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
          .detail-row:last-child { border-bottom: none; }
          .success-badge { background: #4CAF50; color: white; padding: 10px 20px; border-radius: 20px; display: inline-block; margin: 15px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Loan Approved!</h1>
          </div>
          <div class="content">
            <p>Hello ${data.userName},</p>
            <div class="success-badge">✓ Congratulations! Your loan has been approved</div>
            <p>We are pleased to inform you that your loan request has been approved and the loan has been created in your account.</p>
            <div class="loan-details">
              <h3>Loan Details:</h3>
              <div class="detail-row">
                <span>Loan Amount:</span>
                <strong>PKR ${data.loanAmount.toLocaleString()}</strong>
              </div>
              <div class="detail-row">
                <span>Interest Rate:</span>
                <strong>${data.interestRate}% per annum</strong>
              </div>
              <div class="detail-row">
                <span>Tenure:</span>
                <strong>${data.tenureMonths} months</strong>
              </div>
              <div class="detail-row">
                <span>Monthly Installment:</span>
                <strong>PKR ${data.monthlyInstallment.toLocaleString()}</strong>
              </div>
              <div class="detail-row">
                <span>First Payment Due:</span>
                <strong>${data.firstPaymentDate}</strong>
              </div>
              <div class="detail-row">
                <span>Approval Date:</span>
                <strong>${data.approvalDate}</strong>
              </div>
            </div>
            <p><strong>Important Reminders:</strong></p>
            <ul>
              <li>Your first payment is due on <strong>${data.firstPaymentDate}</strong></li>
              <li>Please ensure timely payments to maintain a good credit history</li>
              <li>Late payments may incur additional charges</li>
              <li>You can view your full payment schedule in your account dashboard</li>
            </ul>
            <p>Thank you for choosing our microfinance services. We're here to support your financial journey!</p>
          </div>
          <div class="footer">
            <p>© 2025 Coders Cup Microfinance. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
        return this.sendEmail({
            to: email,
            subject: '🎉 Loan Approved - Details Inside',
            html,
            userId,
            emailType: EmailLog_1.EmailType.LOAN_CREATED,
            metadata: {
                loanAmount: data.loanAmount,
                tenureMonths: data.tenureMonths,
                approvalDate: data.approvalDate,
            },
        });
    }
    /**
     * Send installment reminder email
     */
    async sendInstallmentReminder(email, data, userId) {
        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #FF9800; color: white; padding: 20px; text-align: center; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 5px; margin-top: 20px; }
          .reminder-box { background: #fff3cd; border: 2px solid #ffc107; padding: 20px; border-radius: 5px; margin: 15px 0; text-align: center; }
          .amount { font-size: 24px; color: #ff5722; font-weight: bold; }
          .button { display: inline-block; padding: 15px 40px; background: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; font-size: 16px; }
          .button:hover { background: #45a049; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payment Reminder</h1>
          </div>
          <div class="content">
            <p>Hello ${data.userName},</p>
            <p>This is a friendly reminder that your loan payment is due soon.</p>
            <div class="reminder-box">
              <p><strong>Installment #${data.installmentNumber}</strong></p>
              <p class="amount">PKR ${data.amount.toLocaleString()}</p>
              <p>Due Date: <strong>${data.dueDate}</strong></p>
              <p>(${data.daysUntilDue} days remaining)</p>
            </div>
            <p>Please make sure to pay on time to avoid late fees.</p>
            ${data.paymentUrl ? `
            <div style="text-align: center;">
              <a href="${data.paymentUrl}" class="button">Pay Now with Stripe</a>
              <p style="margin-top: 10px; font-size: 12px; color: #666;">Click the button above to make a secure payment</p>
            </div>
            ` : '<p>Login to your account to make a payment.</p>'}
          </div>
          <div class="footer">
            <p>© 2025 Coders Cup Microfinance. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
        return this.sendEmail({
            to: email,
            subject: `Payment Reminder - Due in ${data.daysUntilDue} days`,
            html,
            userId,
            emailType: EmailLog_1.EmailType.INSTALLMENT_REMINDER,
            metadata: {
                installmentNumber: data.installmentNumber,
                amount: data.amount,
                dueDate: data.dueDate,
            },
        });
    }
    /**
     * Send payment confirmation email
     */
    async sendPaymentConfirmation(email, data, userId) {
        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 5px; margin-top: 20px; }
          .success-box { background: #d4edda; border: 2px solid #28a745; padding: 20px; border-radius: 5px; margin: 15px 0; text-align: center; }
          .amount { font-size: 28px; color: #28a745; font-weight: bold; }
          .payment-details { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .button { display: inline-block; padding: 12px 30px; background: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin: 15px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✓ Payment Successful</h1>
          </div>
          <div class="content">
            <p>Hello ${data.userName},</p>
            <div class="success-box">
              <p>✓ Payment Received</p>
              <p class="amount">PKR ${data.amount.toLocaleString()}</p>
              <p>Installment #${data.installmentNumber}</p>
            </div>
            <div class="payment-details">
              <p><strong>Payment Date:</strong> ${data.paidDate}</p>
              <p><strong>Remaining Balance:</strong> PKR ${data.remainingBalance.toLocaleString()}</p>
            </div>
            ${data.receiptUrl ? `<a href="${data.receiptUrl}" class="button">View Receipt</a>` : ''}
            <p>Thank you for your payment! Keep up the great work.</p>
          </div>
          <div class="footer">
            <p>© 2025 Coders Cup Microfinance. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
        return this.sendEmail({
            to: email,
            subject: 'Payment Confirmation - Thank You!',
            html,
            userId,
            emailType: EmailLog_1.EmailType.PAYMENT_CONFIRMATION,
            metadata: {
                installmentNumber: data.installmentNumber,
                amount: data.amount,
                paidDate: data.paidDate,
            },
        });
    }
    /**
     * Send payment failed email
     */
    async sendPaymentFailed(email, data, userId) {
        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f44336; color: white; padding: 20px; text-align: center; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 5px; margin-top: 20px; }
          .error-box { background: #f8d7da; border: 2px solid #f44336; padding: 20px; border-radius: 5px; margin: 15px 0; }
          .button { display: inline-block; padding: 12px 30px; background: #f44336; color: white; text-decoration: none; border-radius: 5px; margin: 15px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payment Failed</h1>
          </div>
          <div class="content">
            <p>Hello ${data.userName},</p>
            <p>Unfortunately, your payment for Installment #${data.installmentNumber} could not be processed.</p>
            <div class="error-box">
              <p><strong>Amount:</strong> PKR ${data.amount.toLocaleString()}</p>
              <p><strong>Reason:</strong> ${data.failureReason}</p>
            </div>
            <p>Please try again or contact your bank if the issue persists.</p>
            <a href="${data.retryUrl}" class="button">Retry Payment</a>
          </div>
          <div class="footer">
            <p>© 2025 Coders Cup Microfinance. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
        return this.sendEmail({
            to: email,
            subject: 'Payment Failed - Action Required',
            html,
            userId,
            emailType: EmailLog_1.EmailType.PAYMENT_FAILED,
            metadata: {
                installmentNumber: data.installmentNumber,
                amount: data.amount,
                failureReason: data.failureReason,
            },
        });
    }
    /**
     * Send overdue notice email
     */
    async sendOverdueNotice(email, data, userId) {
        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #ff5722; color: white; padding: 20px; text-align: center; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 5px; margin-top: 20px; }
          .warning-box { background: #ffebee; border: 2px solid #ff5722; padding: 20px; border-radius: 5px; margin: 15px 0; }
          .urgent { color: #ff5722; font-weight: bold; font-size: 18px; }
          .button { display: inline-block; padding: 15px 40px; background: #ff5722; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; font-size: 16px; }
          .button:hover { background: #e64a19; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚠️ Overdue Payment Notice</h1>
          </div>
          <div class="content">
            <p>Hello ${data.userName},</p>
            <p class="urgent">Your payment is now overdue!</p>
            <div class="warning-box">
              <p><strong>Installment #${data.installmentNumber}</strong></p>
              <p><strong>Original Amount:</strong> PKR ${data.amount.toLocaleString()}</p>
              <p><strong>Late Fee:</strong> PKR ${data.fineAmount.toLocaleString()}</p>
              <p><strong>Total Due:</strong> PKR ${data.totalDue.toLocaleString()}</p>
              <p><strong>Due Date:</strong> ${data.dueDate}</p>
              <p><strong>Days Overdue:</strong> ${data.daysOverdue} days</p>
            </div>
            <p>Please make payment immediately to avoid further penalties and impact on your credit score.</p>
            ${data.paymentUrl ? `
            <div style="text-align: center;">
              <a href="${data.paymentUrl}" class="button">Pay Now with Stripe</a>
              <p style="margin-top: 10px; font-size: 12px; color: #666;">Click the button above to make an immediate payment</p>
            </div>
            ` : '<p>Login to your account to pay now.</p>'}
          </div>
          <div class="footer">
            <p>© 2025 Coders Cup Microfinance. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
        return this.sendEmail({
            to: email,
            subject: `URGENT: Payment Overdue - ${data.daysOverdue} days`,
            html,
            userId,
            emailType: EmailLog_1.EmailType.OVERDUE_NOTICE,
            metadata: {
                installmentNumber: data.installmentNumber,
                daysOverdue: data.daysOverdue,
                totalDue: data.totalDue,
            },
        });
    }
    /**
     * Send default notice email
     */
    async sendDefaultNotice(email, data, userId) {
        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #d32f2f; color: white; padding: 20px; text-align: center; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 5px; margin-top: 20px; }
          .critical-box { background: #ffcdd2; border: 3px solid #d32f2f; padding: 20px; border-radius: 5px; margin: 15px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚨 Loan Default Notice</h1>
          </div>
          <div class="content">
            <p>Hello ${data.userName},</p>
            <p><strong>URGENT: Your loan has been marked as defaulted.</strong></p>
            <div class="critical-box">
              <p><strong>Original Loan Amount:</strong> PKR ${data.loanAmount.toLocaleString()}</p>
              <p><strong>Outstanding Balance:</strong> PKR ${data.outstandingBalance.toLocaleString()}</p>
              <p><strong>Missed Payments:</strong> ${data.missedPayments}</p>
            </div>
            <p>This will have serious consequences including:</p>
            <ul>
              <li>Negative impact on credit score</li>
              <li>Legal action may be taken</li>
              <li>Future loan applications may be rejected</li>
            </ul>
            <p>Please contact us immediately to discuss payment arrangements.</p>
          </div>
          <div class="footer">
            <p>© 2025 Coders Cup Microfinance. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
        return this.sendEmail({
            to: email,
            subject: 'CRITICAL: Loan Default Notice',
            html,
            userId,
            emailType: EmailLog_1.EmailType.DEFAULT_NOTICE,
            metadata: {
                loanAmount: data.loanAmount,
                outstandingBalance: data.outstandingBalance,
                missedPayments: data.missedPayments,
            },
        });
    }
}
exports.emailService = new EmailService();
exports.default = exports.emailService;
