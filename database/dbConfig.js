import mongoose from "mongoose";
import dotenv from "dotenv";
import { initializeGridFS } from "../config/gridfs.js";

dotenv.config();

const connection = async () => {
    try {
        const connect = await mongoose.connect(
            process.env.MongoDBconnectionstring
        );

        console.log("db connected");

        initializeGridFS();

        return connect;

    } catch (error) {
        console.log(error);
    }
};

export default connection;