import express from "express"
import dotenv from "dotenv"
import  cors from "cors"
import connection from "./database/dbConfig.js"
import urlrouter from "./router/router.js"
dotenv.config()
const app= express()
app.use(express.json())
app.use(cors())
connection()
app.use("/api",urlrouter)
app.listen(process.env.PORT,
    console.log("app is listening")
)
