export const doctorOnly = (req, res, next) => {
    if (req.user.role !== "Doctor") {
        return res.status(403).json({
            message: "Access denied. Doctors only."
        });
    }

    next();
};