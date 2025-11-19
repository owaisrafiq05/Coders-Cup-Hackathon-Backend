"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_route_1 = __importDefault(require("./auth.route"));
const user_routes_1 = __importDefault(require("./user.routes"));
const admin_routes_1 = __importDefault(require("./admin.routes"));
const payment_routes_1 = __importDefault(require("./payment.routes"));
const cron_routes_1 = __importDefault(require("./cron.routes"));
const router = (0, express_1.Router)();
// All Authentication Routes
router.use('/auth', auth_route_1.default);
router.use('/users', user_routes_1.default);
router.use('/admin', admin_routes_1.default);
router.use('/payments', payment_routes_1.default);
router.use('/cron', cron_routes_1.default);
// Add other module routes here (example):
// router.use('/loans', loanRoutes);
exports.default = router;
