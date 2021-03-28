const express = require('express');
const bodyParser = require('body-parser');
const {sequelize} = require('./model')
const {getProfile} = require('./middleware/getProfile')
const {Op} = require("sequelize");
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

    const contractFilter = 
    	{
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

app.get('/contracts',getProfile ,async (req, res) =>{
    const {Contract} = req.app.get('models')
    const profileId  = req.profile.id

    const contractsFilter = 
    	{
    		where:{
    				[Op.not]: [{ status: "terminated"}],
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

    const contracts = await Contract.findAll(contractsFilter)

    if(!contracts) return res.status(404).end()
    res.json(contracts)
})

app.get('/jobs/unpaid',getProfile ,async (req, res) =>{
	const {Contract, Job} = req.app.get('models')
    const profileId  = req.profile.id

    const jobsFilter = 
    	{
    		where:{
    				// In the database table Jobs, the column "paid" = NULL or 1
    				// Be careful if setting it to zero to indicate "unpaid" as this would not work
    				// This could also be paid != ,
					paid: {[Op.eq]: null},
			},
    		include: [
    			{
    				model: Contract,
    				where: {
    					status: "in_progress",
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
    		]
    	}

    const unpaidJobs = await Job.findAll(jobsFilter)

    if(!unpaidJobs) return res.status(404).end()
    res.json(unpaidJobs)
})

module.exports = app;