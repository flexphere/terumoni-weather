const mysql = require('mysql');
const moment = require('moment');
const axios = require('axios');

// Teruteru DataURL
const URL = process.env.WEATHER_API_URL;
const APIKEY = process.env.WEATHER_API_KEY;

// Database settings
const DB_CONFIG = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
};

// DB接続
const connectDB = () => {
    return new Promise((resolve, reject) => {
        const con = mysql.createConnection(DB_CONFIG);
        con.connect(err => {
            if (err) reject(err);
            console.log('db connected');
            resolve(con);
        });
    });
};

// DB切断
const disconnectDB = (con) => {
    return new Promise((resolve, reject) => {
        con.end((err) => {
            if (err) reject(err);
            console.log('db disconnected');
            resolve(true);
        });
    });
};

//発電所情報からユニークなcity_id取得
const getCityID = (con) => {
    return new Promise((resolve, reject) => {
        con.query(`select distinct city_id from plants`, (err, rows, fields) => {
            if (err) reject(err);
            resolve(rows);
        });
    });
};

//気象情報のDB存在確認
const dataExists = (con, date, city_id) => {
    return new Promise((resolve, reject) => {
        const q = `SELECT count(*) AS cnt FROM weather WHERE time = ? AND city_id = ?`;
        con.query(q, [date, city_id], (err, rows, fields) => {
            if (err) reject(err);
            const exists = (rows && rows[0].cnt > 0) ? true : false;
            resolve(exists);
        });
    });
};

//気象情報をDBに保存
const insertData = (con, data) => {
    return new Promise((resolve, reject) => {
        let description = "";
        if (data.weather.length) {
            description = data.weather.map(w => w.description).join(' / ');
        }
        const q = `
            INSERT INTO weather (city_id,city_name,time,temp,temp_min,temp_max,pressure,humidity,wind_speed,wind_deg,clouds,description) 
            VALUES (
                ${data.id},
                '${data.name}',
                '${data.time}',
                ${data.main.temp},
                ${data.main.temp_min},
                ${data.main.temp_max},
                ${data.main.pressure},
                ${data.main.humidity},
                ${data.wind.speed},
                ${data.wind.deg || 0},
                ${data.clouds.all},
                '${description}'
             );
        `;
        con.query(q, (err, rows, fields) => {
            if (err) reject(err);
            resolve(rows);
        });
    });
};


const crawl = async() => {
    let con;
    try {
        con = await connectDB();
        const locations = await getCityID(con);

        for (const location of locations) {
            // UTC+9hours
            const date = moment().add(9, 'hours').format("YYYY-MM-DD HH:mm:00");

            const exist = await dataExists(con, date, location.city_id);
            if (exist) {
                console.log(`Skipping: ${date} / ${location.city_id}`);
                continue;
            }

            const options = {
                id: location.city_id,
                appid: APIKEY,
                units: "metric",
                lang: "ja"
            };
            const response = await axios.get(URL, { params: options });
            response.data.time = date;
            await insertData(con, response.data);
            console.log(`Insert: ${date} / ${location.city_id}`);
        };
    } catch (err) {
        console.log(err.stack);
        // throw err;
    }
    await disconnectDB(con);
};

crawl();