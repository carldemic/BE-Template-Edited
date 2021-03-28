const express = require('express');
const bodyParser = require('body-parser');
const {sequelize} = require('./model')
const {getProfile} = require('./middleware/getProfile')
const { Op } = require("sequelize");
const app = express();
app.use(bodyParser.json());
app.set('sequelize', sequelize)
app.set('models', sequelize.models)

/*
 * @returns contract by id
 */
app.get('/contracts/:id',getProfile ,async (req, res) =>{
    const {Contract} = req.app.get('models')
    const contractId = req.params.id
    const profileId  = req.profile.id

    const contractFilter = {
    							where:{
    								id: contractId,
    								[Op.or]: [
    									{
    										ContractorId: profileId
    									},
    									{
    										ClientId: profileId
    									}
    								]
    							}
    						}

    const contract = await Contract.findOne(contractFilter)

    // Return 404 to avoid enumeration, even if the contract exists under another client or contractor
    if(!contract) return res.status(404).end()
    res.json(contract)
})

module.exports = app;