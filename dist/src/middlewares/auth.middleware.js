"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const authMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized: Missing or invalid Authorization header',
            });
        }
        const token = authHeader.split(' ')[1];
        // Use the same secret that was used to sign the access token
        const accessSecret = process.env.JWT_ACCESS_SECRET;
        if (!accessSecret) {
            console.error('JWT_ACCESS_SECRET is not defined in environment variables');
            return res.status(500).json({
                success: false,
                message: 'Server configuration error',
            });
        }
        let decoded;
        try {
            decoded = jsonwebtoken_1.default.verify(token, accessSecret);
        }
        catch (err) {
            console.error('JWT verification error:', err);
            return res.status(401).json({
                success: false,
                message: 'Unauthorized: Invalid or expired token',
            });
        }
        // Validate payload (we expect "sub" and "role")
        if (!decoded || !decoded.sub || !decoded.role) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized: Invalid token payload',
            });
        }
        // Attach user info to request
        req.user = {
            id: decoded.sub,
            role: decoded.role,
            email: decoded.email,
        };
        next();
    }
    catch (error) {
        console.error('authMiddleware error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
};
exports.authMiddleware = authMiddleware;
