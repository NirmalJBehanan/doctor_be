import jwt from "jsonwebtoken"
export const middleware = async (req, res, next) => {
    try {
        const authhead = req.headers.authorization;
        if (!authhead) {
            return res.status(400).json({
                message: "token is missing"
            })
        }
        const token = authhead.split(" ")[1];
        const decode = jwt.verify(token, process.env.JWT_SECRET)
        req.user = decode
        next()
    } catch (error) {
        console.log("error is from middleware", error);

        return res.status(401).json({
            message: "Invalid or expired token"
        });
    }
}