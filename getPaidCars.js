const fetch = require('node-fetch');
const HttpsProxyAgent = require('https-proxy-agent');
const cheerio = require('cheerio');
const CAR = require("./models/cars");
const PROXY = require("./models/proxy");
const Config = require('./config')

const axios = require('axios');
const url = require('url');
const FormData = require('form-data');
const CronJob = require('cron').CronJob;

const MAX_VIEWS = Config.paidMaxViews
const isProcessing = {}

const getPaidNewCars = async (page = 1, city) => {
    if (page > 5) {
        console.log(city +' finished job(paid)')
        return;
    }

    const html = await getHtmlFromSearchPage(page, city)
    
    if(html){
        const cars = getCarsJsonDataFromSearchPageHtml(html);
        console.log(city+' number of cars on ' + page + ' page(paid): ' + cars.length)
    
        for (let i = 0; i < cars.length; i++) {
            const views = await checkViewsOfCar(cars[i].id)
            // try to check by publicationDate
            if (views && views < MAX_VIEWS) {
                const isInDb = await checkForExistenceInCarfastCarsDb(cars[i], page, views)
                if (!isInDb) {
                    const carHtml = await getHtmlFromCarPage(cars[i].id)
    
                    if (!carHtml) {
                        continue;
                    }
    
                    const carJson = getCarJsonDataFromCarPageHtml(carHtml)
    
                    if (!carJson) {
                        continue;
                    }
    
                    await saveFullInfoInDB(cars[i].id, carJson)
                }
            }
    
        }
    }

    await timeOut(100)
    await getPaidNewCars(page + 1, city)
}

const timeOut = (timeout) =>{
    return new Promise((resolve)=>{
        setTimeout(() => {
            resolve()
        },timeout)
    })
}

// returns html from kolesa page as a string
const getHtmlFromSearchPage = async (page, city) => {
    const defaultUrl = `https://kolesa.kz/cars/${city}/`
    const params = page > 1 ? '?page=' + page : ''
    
    for (let counter = 0; counter < 10; counter++) {
        const html = await getUrl(defaultUrl + params)
        if (html !== null) {
            return html;
        }
        console.log(city+ ' Trying again page '+page)   
    }
    return undefined
}

// returns json data with cars information from search page html
const getCarsJsonDataFromSearchPageHtml = (html) => {
    try {
        const parsedData = cheerio.load(html)

        const listOfScriptsWithCarsData = parsedData('#results script').toArray().map(it => {
            if (it && it.children && it.children[0] && it.children[0].data) {
                return it.children[0].data
            }

            return undefined
        }).filter(it => !!it)

        return listOfScriptsWithCarsData
            .map(it => it.split('.items.push(')[1])
            .filter(it => !!it)
            .map(it => it.split(');')[0])
            .filter(it => !!it)
            .map(it => {
                let result
                try {
                    result = JSON.parse(it)
                } catch (err) {
                    console.log(err)
                }
                return result
            })
            .filter(it => !!it)
    } catch (err) {
        return []
    }

}

// returns html from kolesa car page
const getHtmlFromCarPage = async (carId) => {
    const defaultUrl = `https://kolesa.kz/a/show/${carId}`
    for (let counter = 0; counter < 10; counter++) {
        const html = await getUrl(defaultUrl)
        if (html !== null) {
            return html
        }
        console.log(' Trying again '+page)
    }
    return undefined
}

// returns json data with car information from car page html
const getCarJsonDataFromCarPageHtml = (html) => {
    try {
        const parsedData = cheerio.load(html)

        // let isNew = parsedData('.a-label--new').text()==='Новая'? true:false
        // let probeg = isNew ? 'Новая' : parsedData('dt[title="Пробег"]').first().next("dd").text().trim()
        let probeg = parsedData('dt[title="Пробег"]').first().next("dd").text().trim() === '' ? 'Нет данных' : parsedData('dt[title="Пробег"]').first().next("dd").text().trim()
        let condition = parsedData('.offer__parameters-mortgaged').text() === 'Аварийная/Не на ходу' ? 'Аварийная' : 'На ходу'
        let gearbox = parsedData('dt[title="Коробка передач"]').first().next("dd").text().trim()
        let isCleared = parsedData('dt[title="Растаможен в Казахстане"]').first().next("dd").text().trim() === 'Да' ? true : false
        let volume = parsedData('dt[title="Объем двигателя, л"]').first().next("dd").text().trim()
        let rul = parsedData('dt[title="Руль"]').first().next("dd").text().trim()
        let privod = parsedData('dt[title="Привод"]').first().next("dd").text().trim()
        let kuzov = parsedData('dt[title="Кузов"]').first().next("dd").text().trim()

        const infoObj = {
            condition: condition,
            gearbox: gearbox,
            isCleared: isCleared,
            volume: volume,
            probeg: probeg,
            rul: rul,
            privod: privod,
            kuzov: kuzov,
        }

        return infoObj
    } catch (err) {
        return undefined
    }

}

//checks by id if car presents in db or not (if not saves new car in db and return false, else return true)
const checkForExistenceInCarfastCarsDb = async (car, page, view, cb) => {
    const isCar = await CAR.findOne({ id: car.id })

    if (!isCar) {

        let diff = car.attributes.avgPrice ? round((car.attributes.avgPrice - car.unitPrice) / (car.attributes.avgPrice / 100), 2) : null
        let difference = car.attributes.avgPrice ? diff < 0 ? 'На ' + Math.abs(diff) + '% дороже рынка' : 'На ' + diff + '% дешевле рынка' : null
        let percent = car.attributes.avgPrice ? diff < 0 ? Math.abs(diff) : parseFloat('-' + Math.abs(diff)) : null

        await CAR.create({
            id: car.id,
            brand: car.attributes.brand ? car.attributes.brand : "",
            model: car.attributes.model ? car.attributes.model : "",
            title: car.name.split('  ')[0],
            year: parseInt(car.name.split('  ')[1].split(' ')[0]),
            price: car.unitPrice,
            average: car.attributes.avgPrice ? car.attributes.avgPrice : car.unitPrice,
            date: car.publicationDate,
            city: car.city,
            url: car.url,
            difference: difference,
            percent: percent,
            page: page,
            view: view
        })
        console.log('I have found new car(paid): '+car.name.split('  ')[0])
        return false
    } else {
        return true
    }
}

//returns number of view of car
async function checkViewsOfCar(carId) {
    const formData = new FormData();
    formData.append('return_counters', 1);
    formData.append('nb_views', 1);

    try {
        let res
        if(!Config.useProxy){
            const proxies = await PROXY.find({ banned: false , flag: true})
            const proxy = proxies[Math.floor(Math.random() * proxies.length)] || {}
            let agent = new HttpsProxyAgent(proxyOpts);
            if (proxy.proxy) {
                var proxyOpts = url.parse(proxy.proxy);
                proxyOpts.auth = `${Config.proxyLogin}:${Config.proxyPass}`;
                agent = new HttpsProxyAgent(proxyOpts);
            }
            res = await axios.post('https://kolesa.kz/ms/views/kolesa/live/' + carId + '/', formData, { headers: formData.getHeaders(), httpsAgent: agent})
        }else{
            const proxies = await PROXY.find({ banned: false , flag: false })
            const proxy = proxies[Math.floor(Math.random() * proxies.length)] || {}
            let agent;
            if (proxy.proxy) {
                var proxyOpts = url.parse(proxy.proxy);
                proxyOpts.auth = `${Config.proxyLogin}:${Config.proxyPass}`;
                agent = new HttpsProxyAgent(proxyOpts);
            }
            res = await axios.post('https://kolesa.kz/ms/views/kolesa/live/' + carId + '/', formData, { headers: formData.getHeaders(), httpsAgent: agent })
        }

        return res.data.data.nb_views ? res.data.data.nb_views : null

    } catch (err) {
        // console.log(err,209)
        return null
    }
}

//updates existing car with full info(such as probeg, condition and etc)
async function saveFullInfoInDB(carId, carInfo) {
    await CAR.updateOne(
        { id: carId },
        [
            { $set: carInfo }
        ]
    )
}

//fetch request to get response body of requested page(two options with proxy or not)
async function getUrl(endpoint) {
    try {
        let response
        if (!Config.useProxy) {
            const proxies = await PROXY.find({ banned: false, flag:true })
            const proxy = proxies[Math.floor(Math.random() * proxies.length)] || {}
            //if we use login and pass for proxy
            var proxyOpts = url.parse(proxy.proxy);
            proxyOpts.auth = `${Config.proxyLogin}:${Config.proxyPass}`;
            
            const proxyAgent = new HttpsProxyAgent(proxyOpts);
            response = await fetch(endpoint, { timeout: 5000,agent: proxyAgent });
        } else {
            const proxies = await PROXY.find({ banned: false ,flag:false })
            const proxy = proxies[Math.floor(Math.random() * proxies.length)] || {}
            //if we use login and pass for proxy
            var proxyOpts = url.parse(proxy.proxy);
            proxyOpts.auth = `${Config.proxyLogin}:${Config.proxyPass}`;
            
            const proxyAgent = new HttpsProxyAgent(proxyOpts);
            response = await fetch(endpoint, { timeout: 5000,agent: proxyAgent });
        }

        if (response && response.status === 200) {
            const body = await response.text();
            return body
        } else {
            console.log('Could not get response from '+endpoint+" and status code: " + response.status);
            return null
        }
    }
    catch (err) {
        console.log(err, 267)
        return null
    }
}

//round number with some precision
function round(value, precision) {
    var multiplier = Math.pow(10, precision || 0);
    return Math.round(value * multiplier) / multiplier;
}

function createJob(city){
    return new CronJob(Config.getPaidCarsCrone, async function () {
        if (isProcessing[city]) {
            console.log('Job still not finished')
            return
        }
        isProcessing[city] = true

        console.log('Started job (paid)');
        try{
            await getPaidNewCars(1, city)
        }catch(err){
            console.error(err,299)
        }finally{
            isProcessing[city] = false
            console.log(city+' FINISHED job (paid)');
        }
    });
}

const almatyJob = createJob('almaty')
almatyJob.start()

const nurSultanJob = createJob('nur-sultan')
nurSultanJob.start()

const shymkentJob = createJob('shymkent')
shymkentJob.start()

const akmlOblJob = createJob('region-akmolinskaya-oblast')
akmlOblJob.start()
const aktOblJob = createJob('region-aktubinskaya-oblast')
aktOblJob.start()
const almOblJob = createJob('region-almatinskaya-oblast')
almOblJob.start()
const atyrOblJob = createJob('region-atyrauskaya-oblast')
atyrOblJob.start()
const vkOblJob = createJob('region-vostochnokazakhstanskaya-oblast')
vkOblJob.start()
const zhamOblJob = createJob('region-zhambilskaya-oblast')
zhamOblJob.start()
const zkOblJob = createJob('region-zapadnokazakshstabskaya-oblast')
zkOblJob.start()
const krgOblJob = createJob('region-karagandinskaya-oblast')
krgOblJob.start()
const kostOblJob = createJob('region-kostanayskaya-oblast')
kostOblJob.start()
const kzlOblJob = createJob('region-kyzylordinskaya-oblast')
kzlOblJob.start()
const mangOblJob = createJob('region-mangistauskaya-oblast')
mangOblJob.start()
const pavlOblJob = createJob('region-pavlodarskaya-oblast')
pavlOblJob.start()
const skOblJob = createJob('region-severokazakhstanskaya-oblast')
skOblJob.start()
const yukOblJob = createJob('region-yuzhnokazahstanskaya-oblast')
yukOblJob.start()