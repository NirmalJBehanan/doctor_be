import mongoose from "mongoose";
import { GridFSBucket } from "mongodb";

let bucket;

export const initializeGridFS = () => {
    const db = mongoose.connection.db;

    bucket = new GridFSBucket(db, {
        bucketName: "doctorImages"
    });

    console.log("GridFS initialized");
};

export const getBucket = () => {
    return bucket;
};