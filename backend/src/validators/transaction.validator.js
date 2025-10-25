const Joi = require('joi');

const createTransactionSchema = Joi.object({
  amount: Joi.number().required(),
  date: Joi.date().iso().required(),
  category: Joi.string().required(),
  description: Joi.string().required(),
});

module.exports = { createTransactionSchema };
