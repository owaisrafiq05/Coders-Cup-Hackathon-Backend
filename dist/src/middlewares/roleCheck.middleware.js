"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdmin = void 0;
const requireAdmin = (req, res, next) => {
    const user = req.user;
    if (!user) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized: No authenticated user',
        });
    }
    if (user.role !== 'ADMIN') {
        return res.status(403).json({
            success: false,
            message: 'Forbidden: ADMIN role required',
        });
    }
    next();
};
exports.requireAdmin = requireAdmin;
