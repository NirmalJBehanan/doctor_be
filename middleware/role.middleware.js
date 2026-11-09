
export const doctorOnly = (req, res, next) => {
    if (req.user.role !== "doctor") {
        return res.status(403).json({
            message: "Access denied. Doctors only."
        });
    }

    next();
};

export const adminOnly = (req, res, next) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({
            message: "Access denied. Admins only."
        });
    }

    next();
};
