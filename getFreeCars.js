const fetch = require('node-fetch');
const HttpsProxyAgent = require('https-proxy-agent');
const cheerio = require('cheerio');
const CronJob = require('cron').CronJob;
const Config = require('./config')

const CAR = require("./models/cars");
const PROXY = require("./models/proxy");

const axios = require('axios');
const url = require('url')
const FormData = require('form-data');
const MAX_VIEWS = Config.freeMaxViews

const isProcessing = {}

const getFreeCars = async (page, city, startPage) => {
    if (page >= (startPage + 5)) {
        console.log(city +' finished job(free)')
        return;
    }

    const html = await getHtmlFromSearchPage(page, city)
    if(html){
        const cars = getCarsJsonDataFromSearchPageHtml(html)
        console.log(city+' number of cars on ' + page + ' page(free): ' + cars.length)
        for (let i = 0; i < cars.length; i++) {
            const views = await checkViewsOfCar(cars[i].id)
            // try to check by publicationDate
            if (views && views < MAX_VIEWS) {
                const isInDb = await checkForExistenceInCarfastCarsDb(cars[i], page, views)
                if (!isInDb) {

                    const carHtml = await getHtmlFromCarPage(cars[i].id)

                    if (!carHtml) {
                        continue;
                    }else{
                        console.log('here')
                    }

                    const carJson = getCarJsonDataFromCarPageHtml(carHtml)

                    if (!carJson) {
                        continue;
                    }else{
                        console.log('here2')
                    }

                    await saveFullInfoInDB(cars[i].id, carJson)
                }
            }
        }
    }
    
    await timeOut(100)
    await getFreeCars(page + 1, city, startPage)

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
        console.log(city+ ' Trying again free '+page)   
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
        console.log('Trying again free'+page)
    }
    return undefined
}

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

const checkForExistenceInCarfastCarsDb = async (car, page, view) => {
    const isCar = await CAR.findOne({ id: car.id })
    if (!isCar) {
        let diff = car.attributes.avgPrice ? round((car.attributes.avgPrice - car.unitPrice) / (car.attributes.avgPrice / 100), 2) : null
        let difference = car.attributes.avgPrice ? diff < 0 ? 'На ' + Math.abs(diff) + '% дороже рынка' : 'На ' + diff + '% дешевле рынка' : null
        let percent = car.attributes.avgPrice ? diff < 0 ? Math.abs(diff) : parseFloat('-' + Math.abs(diff)) : null
        // console.log(car.id+" "+car.attributes.brand +' '+car.attributes.model);

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
        console.log('I have found new car(free): '+car.name.split('  ')[0])
        return false
    } else {
        console.log('exists in db')
        return true
    }
}

async function checkViewsOfCar(carId) {
    const formData = new FormData();
    formData.append('return_counters', 1);
    formData.append('nb_views', 1);

    try {
        let res
        if(!Config.useProxy){
            const proxies = await PROXY.find({ banned: false, flag:true })
            const proxy = proxies[Math.floor(Math.random() * proxies.length)] || {}
            let agent;
            if (proxy.proxy) {
                var proxyOpts = url.parse(proxy.proxy);
                proxyOpts.auth = `${Config.proxyLogin}:${Config.proxyPass}`;
                agent = new HttpsProxyAgent(proxyOpts);
            }
            res = await axios.post('https://kolesa.kz/ms/views/kolesa/live/' + carId + '/', formData, { headers: formData.getHeaders(), httpsAgent: agent })
        }else{
            const proxies = await PROXY.find({ banned: false , flag:false })
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

async function saveFullInfoInDB(carId, carInfo) {
    await CAR.updateOne(
        { id: carId },
        [
            { $set: carInfo }
        ], (err, res) => {
            if (!err) {
                
            }else{
                console.log('Something wrong with update')
            }
        }
    )
}

function round(value, precision) {
    var multiplier = Math.pow(10, precision || 0);
    return Math.round(value * multiplier) / multiplier;
}

const getFreeCarsStartingPage = async (page, min, max, counter, city) => {
    if (counter > 10) {
        console.log('Something went wrong with getFreeCarsStartingPage ' + page)
        return page
    }

    const html = await getHtmlFromSearchPage(page, city)
    
    if(html){
        const cars = getCarsJsonDataFromSearchPageHtml(html);
        if(cars){
            let isFirstFree = cars[0].appliedPaidServices ? false : true
            let isLastPaid = cars[cars.length - 1].appliedPaidServices ? true : false
            //иногда после бесплатных может появиться одна-две платные
            //если первая бесплатная то следующие все бесплатные
            if (isFirstFree) {
                //двигаемся назад
                max = page
                newPage = Math.floor((min + max) / 2)
                return await getFreeCarsStartingPage(newPage, min, max, ++counter, city)
            }
            //если последняя платная то предыдущие платные
            else if (isLastPaid) {
                //двигаемся вперед
                min = page
                newPage = Math.floor((min + max) / 2)
                return await getFreeCarsStartingPage(newPage, min, max, ++counter, city)
            }
            else {
                //это нужная страница
                return page
            }
        }
    }
}

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
            response = await fetch(endpoint, { timeout: 2000, agent: proxyAgent });
        } else {
            const proxies = await PROXY.find({ banned: false, flag:false })
            const proxy = proxies[Math.floor(Math.random() * proxies.length)] || {}

            //if we use login and pass for proxy
            var proxyOpts = url.parse(proxy.proxy);
            proxyOpts.auth = `${Config.proxyLogin}:${Config.proxyPass}`;
            
            const proxyAgent = new HttpsProxyAgent(proxyOpts);
            response = await fetch(endpoint, { timeout: 2000, agent: proxyAgent });
        }

        if (response && response.status === 200) {
            const body = await response.text();
            return body
        } else {
            console.log('Could not get response '+endpoint+" status code: " + response.status);
            return null
        }
    }
    catch (err) {
        console.log(err, 300)
        return null
    }
}

function createJob(city){
    return new CronJob(Config.getFreeCarsCrone, async function () {
        if (isProcessing[city]) {
            console.log('Job still not finished')
            return
        }
        isProcessing[city] = true
        console.log('Started job (free)');

        try{
            const foundPage = await getFreeCarsStartingPage(100, 0, 200, 1, city)
            if(foundPage){
                console.log(city+' found page where free cars starts : ' + foundPage)
                await getFreeCars(foundPage - 3, city, foundPage)
            }
        }catch(err){
            console.error(err,351)
        }finally{
            isProcessing[city] = false
            console.log(city+' Finished job (free)');
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