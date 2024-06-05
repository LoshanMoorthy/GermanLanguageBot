import { Client, GatewayIntentBits } from 'discord.js';
import axios from 'axios';
import dotenv from 'dotenv';
import schedule from 'node-schedule';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const token = process.env.DISCORD_BOT_TOKEN;

const activeQuizzes = new Map();
const userScores = new Map();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let words;
try {
    const filePath = path.join(__dirname, 'german_english.json');
    const fileContent = readFileSync(filePath, 'utf-8');
    const wordsDict = JSON.parse(fileContent);
    words = Object.entries(wordsDict).map(([german, english]) => ({ german, english }));
    console.log('Loaded words from JSON file:', words);
} catch (error) {
    console.error('Error loading words from JSON file:', error);
}

client.once('ready', () => {
    console.log('Ready!');
    
    schedule.scheduleJob('0 10 * * *', () => {
        const channel = client.channels.cache.get(process.env.CHANNEL_ID);
        if (channel) {
            sendDailyLesson(channel);
        }
    });
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const content = message.content.toLowerCase();

    if (content.startsWith('!translate')) {
        const parts = content.split(' ');
        if (parts.length < 3) {
            message.channel.send('Usage: !translate <phrase> <target_language (de)>');
        } else {
            const phrase = parts.slice(1, parts.length - 1).join(' ');
            const targetLanguage = parts[parts.length - 1];
            translatePhrase(message.channel, phrase, targetLanguage);
        }
    } else if (content === '!quiz') {
        provideVocabularyQuiz(message.channel, message.author.id);
    } else if (content === '!lesson') {
        sendDailyLesson(message.channel);
    } else if (content === '!leaderboard') {
        showLeaderboard(message.channel);
    } else if (content === '!help') {
        showHelp(message.channel);
    } else {
        const quiz = activeQuizzes.get(message.author.id);
        if (quiz) {
            if (content.trim().toLowerCase() === quiz.answer.toLowerCase()) {
                message.channel.send(`Correct! The English word for '${quiz.question}' is '${quiz.answer}'.`);
                incrementScore(message.author.id);
            } else {
                message.channel.send(`Incorrect. The English word for '${quiz.question}' is '${quiz.answer}'. Here's a hint: ${quiz.hint}`);
            }
            activeQuizzes.delete(message.author.id);
        }
    }
});

async function translatePhrase(channel, phrase, targetLanguage) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(phrase)}&langpair=en|${targetLanguage}`;

    try {
        const response = await axios.get(url);
        const translatedPhrase = response.data.responseData.translatedText;
        channel.send(`Translated phrase: ${translatedPhrase}`);
    } catch (error) {
        console.error('Error translating phrase:', error);
        channel.send('Sorry, there was an error translating the phrase.');
    }
}

function fetchRandomWord() {
    if (!words || words.length === 0) {
        console.error('No words available for the quiz.');
        return null;
    }
    const randomIndex = Math.floor(Math.random() * words.length);
    return words[randomIndex];
}

function provideVocabularyQuiz(channel, userId) {
    const vocab = fetchRandomWord();
    if (!vocab) {
        channel.send('Sorry, there was an error fetching a quiz word.');
        return;
    }
    if (!vocab.english) {
        console.error('Invalid vocabulary entry:', vocab);
        channel.send('Sorry, there was an error with the quiz word.');
        return;
    }
    const question = `What is the English word for '${vocab.german}'?`;
    const hint = `The first letter of the word is '${vocab.english.charAt(0)}'`;
    channel.send(question);

    activeQuizzes.set(userId, { question: vocab.german, answer: vocab.english, hint: hint });
}

function sendDailyLesson(channel) {
    const vocab = fetchRandomWord();
    if (!vocab) {
        channel.send('Sorry, there was an error fetching the daily lesson word.');
        return;
    }
    if (!vocab.english) {
        console.error('Invalid vocabulary entry:', vocab);
        channel.send('Sorry, there was an error with the daily lesson word.');
        return;
    }
    const lesson = `Today's lesson: The German word for '${vocab.english}' is '${vocab.german}'.`;
    channel.send(lesson);
}

function showLeaderboard(channel) {
    if (userScores.size === 0) {
        channel.send('No scores yet. Start playing to get on the leaderboard!');
        return;
    }

    const sortedScores = [...userScores.entries()].sort((a, b) => b[1] - a[1]);
    const leaderboard = sortedScores.map(([userId, score], index) => `${index + 1}. <@${userId}>: ${score} points`).join('\n');
    channel.send(`**Leaderboard**:\n${leaderboard}`);
}

function incrementScore(userId) {
    const currentScore = userScores.get(userId) || 0;
    userScores.set(userId, currentScore + 1);
}

function showHelp(channel) {
    const helpMessage = `
**German Language Learning Bot Commands:**
- \`!translate <phrase> <target_language>\`: Translates the provided phrase into the target language (de).
- \`!quiz\`: Asks a random vocabulary question. Respond with the correct answer.
- \`!lesson\`: Provides a daily lesson with a random vocabulary word.
- \`!leaderboard\`: Shows the quiz leaderboard.
- \`!help\`: Shows this help message.
    `;
    channel.send(helpMessage);
}

client.login(token);
