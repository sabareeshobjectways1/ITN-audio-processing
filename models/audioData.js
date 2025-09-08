import mongoose from 'mongoose';
// const mongoose = require('mongoose');

const AudioDataSchema = new mongoose.Schema({
  speakerid: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', '']
  },
  age: {
    type: String
  },
  country: {
    type: String
  },
  speakerId_sequence: {
    type: String,
    unique: true
  },
  speed: {
    type: String,
    enum: ['comfortable_slow', 'comfortable_normal', 'comfortable_fast', 'soft_slow', 'soft_normal', 'soft_fast']
  },
  text: {
    type: String,
    required: true
  },
  validation_status: {
    type: Boolean,
    default: false
  },
  update: {
    type: String
  },
  audio_path: {
    type: String
  },
  image_path: {
    type: String
  }
});

const AudioData = mongoose.model("AudioData", AudioDataSchema);

export default AudioData;
