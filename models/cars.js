const mongoose = require("mongoose");

const CarsSchema = new mongoose.Schema(
  {
    id:{
      type: Number,
      required: true,
      unique: true,
    },
    brand:{
      type: String,
      required: true,
    },
    model: {
      type: String,
    },
    title:{
      type: String,
      required: true,
    },
    year: {
      type: Number,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    average: {
      type: Number,
      required: true,
    },
    date: {
      type: Date,
    },
    city: {
      type: String,
    },
    url: {
      type: String,
    },
    percent: {
      type: Number,
    },
    difference: {
      type: String,
    },
    page: {
      type: Number,
    },
    view: {
      type: Number,
    },
    phone: {
      type: String,
      default:null
    },
    isArchive:{
      type: Boolean,
      default: false
    },
    send:{
      type: Boolean,
      default: false
    },
    isWP:{
      type: Boolean,
      default: true
    },
//--------------------------------
    condition: {
      type: String,
    },
    gearbox: {
      type: String,
    },
    isCleared: {
      type: Boolean,
    },
    volume: {
      type: String,
    },
    probeg: {
      type: String,
    },
    rul: {
      type: String,
    },
    privod: {
      type: String,
    },
    kuzov: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("cars", CarsSchema);
