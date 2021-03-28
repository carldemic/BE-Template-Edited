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


app.post('/jobs/:id/pay',getProfile ,async (req, res) =>{
	const {Contract, Job, Profile} = req.app.get('models')
    const jobId = req.params.id
    const profileId  = req.profile.id

    // Get the job

    const jobFilter = 
    	{
    		where:{
					id: jobId,
					paid: {[Op.eq]: null},
			},
    		include: [
    			{
    				model: Contract,
    				where: {
						ClientId: profileId
    				}
    			}
    		]
    	}

    var job = await Job.findOne(jobFilter)
    if(!job) return res.status(404).end()
    
    const transaction = await sequelize.transaction()

    // Try to perform the tansaction, roll back if errors occur
	try{

    	const client = await Profile.findOne({ where:{ id: profileId }})

		// Check the client budget and return 402 Payment Required if it's not enough
		if(job.price > client.balance)
			return res.status(402).end()
		
		client.balance -= job.price
		client.save()

		job.paid = 1
   		job.save()

   		transaction.commit()
   		res.json(job)
	}
	catch(error){
		await transaction.rollback()
		// send "error" to logging system
		console.log(error)
		return res.status(500).end(error)
	}

})


app.post('/jobs/:id/pay',getProfile ,async (req, res) =>{
	const {Contract, Job, Profile} = req.app.get('models')
    const jobId = req.params.id
    const profileId  = req.profile.id

    // Get the job

    const jobFilter = 
    	{
    		where:{
					id: jobId,
					paid: {[Op.eq]: null},
			},
    		include: [
    			{
    				model: Contract,
    				where: {
						ClientId: profileId
    				}
    			}
    		]
    	}

    var job = await Job.findOne(jobFilter)
    if(!job) return res.status(404).end()
    
    const transaction = await sequelize.transaction()

    // Try to perform the tansaction, roll back if errors occur
	try{

    	const client = await Profile.findOne({ where:{ id: profileId }})

		// Check the client budget and return 402 Payment Required if it's not enough
		if(job.price > client.balance)
			return res.status(402).end()
		
		client.balance -= job.price
		client.save()

		job.paid = 1
   		job.save()

   		transaction.commit()
   		res.json(job)
	}
	catch(error){
		await transaction.rollback()
		// send "error" to logging system
		console.log(error)
		return res.status(500).end(error)
	}

})

app.post('/balances/deposit/:userId',getProfile ,async (req, res) =>{
	const {Contract, Job, Profile} = req.app.get('models')
    const userId = req.params.userId
    const amount  = req.body.amount

    // TODO: It's not clear who can deposit where... enabling deposit for everyone to every client

    // Check the client's total Jobs to Pay ( amount <= 0.25 * total )

    const jobsFilter = 
    	{
    		where:{
					paid: {[Op.eq]: null},
			},
    		include: [
    			{
    				model: Contract,
    				where: {
						ClientId: userId
    				}
    			}
    		]
    	}
    
    const client = await Profile.findOne({ where:{ id: userId }})

    var jobs = await Job.findAll(jobsFilter)
    if(!jobs) return res.status(404).end()

	total = jobs.reduce(( accumulator, job ) => accumulator + job.price, 0);
	
	if(amount > 0.25*total) return res.status(412).end("Amount over 25% of total to be paid")

	client.balance += amount;
	
	try{
		client.save()
	}
	catch(error){
		console.log(error)
		return res.status(500).end()
	}

    return res.json(client)

})



module.exports = app;