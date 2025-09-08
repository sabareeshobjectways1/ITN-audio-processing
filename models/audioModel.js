import mongoose from "mongoose";

const audioSchema = new mongoose.Schema({
  name: { type: String, required: true },
  country: { type: String, required: true },
  gender: { type: String, required: true },
  audioPath: { type: String, required: true },
  age: { type: String },
  speakerId: { type: String, index: true },
  text: { type: String }
});

// This function dynamically creates a model with collection name based on user name
export const getAudioModelForUser = (userName) => {
  const collectionName = userName.replace(/\s/g, '_'); // sanitize collection name
  return mongoose.model(`AudioData_${collectionName}`, audioSchema, collectionName);
};
