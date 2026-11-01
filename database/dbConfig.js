import mongoose from "mongoose";
import dotenv from "dotenv"
dotenv.config();
const connection = async()=>{
    const connect=await mongoose.connect(process.env.MongoDBconnectionstring)
    console.log("db connected");
    return connect
}

export default connection;