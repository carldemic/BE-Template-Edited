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
			return res.status(402).end("Insufficient balance")
		
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
		return res.status(500).end("Error, transaction rolled back")
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
    
    var client = await Profile.findOne({ where:{ id: userId }})

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


app.get('/admin/best-profession',getProfile ,async (req, res) =>{
	const {Contract, Job, Profile} = req.app.get('models')
    const profileId  = req.profile.id // TODO: authentication? 

	const start = req.query.start
	const end = req.query.end

	if(start == undefined || end == undefined) return res.status(400).end("Start and end parameters required in the query string")

    const jobsFilter = 
    	{
    		where:{
					paid: 1,
					paymentDate: {[Op.between]: [start, end]},
			},
    		include: [
    			{
    				model: Contract,
    				include: [
    					{
    						model: Profile,
    						as: "Contractor",
    						attributes: [ 
    							"type",
    							"profession",
    							[sequelize.fn('sum', sequelize.col('price')), 'total_paid']],
    					}
    				]
    			},
    			
    		],
    		group: ["profession"],
    	}

    try{
    	const jobs = await Job.findAll(jobsFilter)

	    if(!jobs) return res.status(404).end()

	    var max_profession = ""
		var max_earned = 0

	    jobs.forEach(job => {
	    	total_paid = job.Contract.Contractor.dataValues.total_paid
	    	profession = job.Contract.Contractor.profession
	    	if(total_paid > max_earned){
	    		max_earned = total_paid
	    		max_profession = profession
	    	}
	    })
    	res.json({"max_profession": max_profession,"start":start,"end":end})
    }
    catch(err){
    	console.log(err)
    	return res.status(500).end("Check the date format, or other input error")
    }

})


app.get('/admin/best-clients',getProfile ,async (req, res) =>{
	const {Contract, Job, Profile} = req.app.get('models')
    const profileId  = req.profile.id // TODO: authentication? 

	const limit_results = req.query.limit ? req.query.limit : 1
	const start = req.query.start
	const end = req.query.end

	if(start == undefined || end == undefined) return res.status(400).end("Start and end parameters required in the query string")

    const jobsFilter = 
    	{
    		where:{
					paid: 1,
					paymentDate: {[Op.between]: [start, end]},
			},
    		include: [
    			{
    				model: Contract,
    				include: [
    					{
    						model: Profile,
    						as: "Client",
    						attributes: [ 
    							"id",
    							"firstName",
    							"lastName",
    							[sequelize.fn('sum', sequelize.col('price')), 'total_paid'],
    						],
    					}
    				]
    			},
    			
    		],
    		group: ['ClientId'],
    		order: sequelize.literal('`Contract.Client.total_paid` DESC'),
    		limit: limit_results,
    	}

    try{
    	const jobs = await Job.findAll(jobsFilter)

	    if(!jobs) return res.status(404).end()

	    var best_clients = []

	    jobs.forEach(job => {
	    	const full_name = `${job.Contract.Client.firstName} ${job.Contract.Client.lastName}` 
	    	const id = job.Contract.Client.id
	    	const total_paid = job.Contract.Client.dataValues.total_paid

	    	best_clients.push({id,full_name,total_paid})
	    })
    	res.json(best_clients)
    }
    catch(err){
    	console.log(err)
    	return res.status(500).end("Check the date format, or other input error")
    }

})

module.exports = app;