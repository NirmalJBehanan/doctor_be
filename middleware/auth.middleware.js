
import jwt from "jsonwebtoken";
import { User } from "../model/user.model.js";

export const middleware = async (req, res, next) => {
    try {
        const authhead = req.headers.authorization;

        if (!authhead) {
            return res.status(400).json({
                message: "Token is missing"
            });
        }

        const token = authhead.split(" ")[1];

        const decode = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        // Check whether the user still exists
        const user = await User.findById(decode.id);

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        // Check whether the account is active
        if (!user.isActive) {
            return res.status(403).json({
                message: "Your account has been deactivated"
            });
        }

        req.user = {
            ...decode,
            id: user._id,
            role: user.role
        };

        next();

    } catch (error) {
        console.log("Authentication error:", error);

        return res.status(401).json({
            message: "Invalid or expired token"
        });
    }
};
