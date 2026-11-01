
import express from "express";
import {
    activation,
    createSlot,
    DeleteSlot,
    getMe,
    getSlots,
    login,
    Register,
    UpdateSlot
} from "../controller/Doctor.controller.js";

import { middleware } from "../middleware/auth.middleware.js";
import { doctorOnly } from "../middleware/role.middleware.js";

const router = express.Router();

router.post("/register", Register);
router.post("/login", login);
router.post("/auth", middleware);
router.post("/activate", middleware, activation);
router.get("/me",middleware,getMe);
router.post("/createSlot",middleware,doctorOnly,createSlot)
router.get("/getSlots", middleware, doctorOnly, getSlots);
router.delete("/deleteSlot/:id", middleware, doctorOnly, DeleteSlot);
router.put("/updateSlot/:id", middleware, doctorOnly, UpdateSlot);
export default router;
