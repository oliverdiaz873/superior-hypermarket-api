import { Router, type Request, type Response, type NextFunction } from "express";
import * as authController from "../controllers/auth.controller";
import authMiddleware from "../../../shared/middleware/auth.middleware";
import { rateLimit } from "../../../shared/middleware/rate-limit.middleware";
import { validateRequiredFields } from "../../../shared/middleware/validation.middleware";
import config from "../../../config";

const router = Router();

const loginRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  message: "Too many login attempts, please try again later",
});

const registerRateLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  message: "Too many registration attempts, please try again later",
});

const authRateLimit =
  (limiter: (req: Request, res: Response, next: NextFunction) => void) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (config.e2eDisableAuthRateLimit) return next();
    limiter(req, res, next);
  };

router.post(
  "/register",
  authRateLimit(registerRateLimit),
  validateRequiredFields(["email", "password"]),
  authController.register
);
router.post("/login", authRateLimit(loginRateLimit), authController.login);
router.post("/logout", authController.logout);
router.get("/me", authMiddleware, authController.getMe);
router.patch("/me", authMiddleware, authController.updateMe);

export default router;
