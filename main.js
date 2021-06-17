const axios = require("axios").default
const fs = require("fs/promises")
const path = require('path')
const fsLegacy = require('fs')
const datefns = require('date-fns')
const dotenv = require('dotenv')
const schedule = require('node-schedule')

dotenv.config();

const FAKE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 10_3_3 like Mac OS X) AppleWebKit/603.3.8 (KHTML, like Gecko) Mobile/14G60 Instagram 12.0.0.16.90 (iPhone9,4; iOS 10_3_3; en_US; en-US; scale=2.61; gamut=wide; 1080x1920)";

const requestHeaders = {
  "User-Agent": FAKE_USER_AGENT,
};

async function mkdirp(path) {
  if (!await pathExists(path)) { 
    await fs.mkdir(path);
  }
}

async function main({
  userId,
  username,
}) {


  if (!userId && !username) {
    console.error('userId is missing')
    return;
  }

  await mkdirp('files');

  if (!username) {
    username = await findUsernameById(userId)
  }

  if (!username) {
    console.log('failure in getting username')
    return;
  }

  const profile = await findProfileByUsername(username)

  if (!profile) {
    console.log('failure in getting user profile');
    return;
  }

  const profileUrl = profile.profile_pic_url_hd || profile.profile_pic_url;

  if (!profileUrl) {
    console.log('profileUrl is missing')
    return;
  }

  await writeResponse(userId || username, profile);
  await downloadImage(userId || username, profileUrl);
}

async function writeResponse(uuid, data) {
  safeFetch(async () => {
    await mkdirp(path.join('files', uuid))
    const json = JSON.stringify(data, null, 2);
    const filename = path.resolve('files', uuid, createFilenameJSON());
    await fs.writeFile(filename, json, 'utf8');
  }) 
}


async function downloadImage(uuid, url) {
  return safeFetch(async() => {
    const response = await axios.get(url, {responseType: 'stream' });
    await mkdirp(path.join('files', uuid))
    const filePath = path.resolve('files', uuid, createFilename());
    const writer = fsLegacy.createWriteStream(filePath)
    response.data.pipe(writer)
    return new Promise((resolve, reject) => {
      writer.on('finish', resolve)
      writer.on('error', reject)
    })
  })
}

async function pathExists(path) {
  try {
    await fs.stat(path);
    return true;
  } catch (err) {
    if (err.code === "ENOENT") {
      return false;
    } else {
      throw err;
    }
  }
}

async function findProfileByUsername(username) {
  return safeFetch(async () => {
    const url = `https://www.instagram.com/${username}/?__a=1`;
    const response = await axios.get(url, {
      headers: requestHeaders,
    });
    return response.data && response.data.graphql.user;
  });
}

async function findUsernameById(id) {
  return await safeFetch(async () => {
    const url = `https://i.instagram.com/api/v1/users/${id}/info/`;
    const response = await axios.get(url, {
      headers: requestHeaders,
    });

    console.log(JSON.stringify(response.data), null, 2);
    return response.data && response.data.user && response.data.user.username;
  });
}

async function safeFetch(callback) {
  try {
    return await callback();
  } catch (e) {
    if (axios.isAxiosError(e)) {
      console.log(e.response.data);
    } else {
      console.error(e);
    }
    return null;
  }
}

function createFilename() {
  const date = new Date();
  const name = datefns.format(date, 'dd-MM-yyyy__HH_mm_ss');
  return `${name}.jpg`
}

function createFilenameJSON() {
  const date = new Date();
  const name = datefns.format(date, 'dd-MM-yyyy__HH_mm_ss');
  return `${name}.json`
}

function configuredUserIds() {
  const value = process.env.USER_IDS;
  if (!value) return [];
  return value.split(',').map(it => it.trim())
}

let index = 0;

if (process.env.USER_IDS) {
  
  schedule.scheduleJob(process.env.APP_CRON, async () => {
    const userIds = configuredUserIds();
    if (!userIds.length) {
      return;
    }
    const i = index % (userIds.length);
    await main({ userId: userIds[i] });
    index++;
  })  

  console.log('app has started')

} else {
  throw new Error('no USER_IDS')
}
