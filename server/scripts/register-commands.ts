import 'dotenv/config';

const applicationId=process.env.DISCORD_CLIENT_ID;
const botToken=process.env.DISCORD_BOT_TOKEN;
const guildId=process.env.DISCORD_GUILD_ID;
if(!applicationId||!botToken){
  throw new Error('Set DISCORD_CLIENT_ID and DISCORD_BOT_TOKEN before registering commands.');
}

const scope=guildId?`guilds/${guildId}`:'commands';
const url=`https://discord.com/api/v10/applications/${applicationId}/${scope}`;
const response=await fetch(url,{
  method:'POST',
  headers:{Authorization:`Bot ${botToken}`,'Content-Type':'application/json'},
  body:JSON.stringify({name:'story',description:'Open a StoryFuse story game.',type:1}),
});
const body=await response.text();
if(!response.ok)throw new Error(`Discord command registration failed (${response.status}): ${body}`);
console.log(`Registered /story ${guildId?'for guild '+guildId:'globally'}: ${body}`);
