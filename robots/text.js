const algorithmia = require('algorithmia');
const algorithmiaApiKey = require('../credentials/algorithmia.json').apiKey;
const sentenceBoundaryDetection = require('sbd');

//const NaturalLanguageUnderstandingV1 = require('watson-developer-cloud/natural-language-understanding/v1.js');
const watsonApiKey = require('../credentials/watson-nlu.json').apikey;
const watsonUrl = require('../credentials/watson-nlu.json').url
const NaturalLanguageUnderstandingV1 = require('ibm-watson/natural-language-understanding/v1.js');
const { IamAuthenticator } = require('ibm-watson/auth');

var nlu = new NaturalLanguageUnderstandingV1({
    version: '2018-04-05',
    authenticator: new IamAuthenticator({
        apikey: watsonApiKey,
    }),
    url: watsonUrl,
});

async function robot(content){
    await fetchContentFromWikipedia(content);
    sanitizeContent(content);
    breakContentIntoSentences(content);
    limitMaximumSentences(content);
    await fetchKeywordsOfAllSentences(content);

    async function fetchContentFromWikipedia(content){
        const algorithmiaAuthenticated = algorithmia(algorithmiaApiKey);
        const wikipediaAlgorithm = algorithmiaAuthenticated.algo('web/WikipediaParser/0.1.2');
        const wikipediaRespose = await wikipediaAlgorithm.pipe(content.searchTerm);
        const wikipediaContent = wikipediaRespose.get();
        content.sourceContentOriginal = wikipediaContent.content;
    }

    function sanitizeContent(content){
        const withoutBlankLinesAndMarkdown = removeBlankLinesAndMarkdown(content.sourceContentOriginal);
        const withoutDatesInParenteses = removeDatesInParenteses(withoutBlankLinesAndMarkdown);
        
        content.sourceContentSanitized = withoutDatesInParenteses;

        function removeBlankLinesAndMarkdown(text){
            const allLines = text.split('\n');
            const withoutBlankLinesAndMarkdown = allLines.filter((line) =>{
                if (line.trim().length === 0 || line.trim().startsWith('=')) return false;
                return true;
            });

            return withoutBlankLinesAndMarkdown.join(' ');
        }

        function removeDatesInParenteses(text){
            return text.replace(/\((?:\([^()]*\)|[^()])*\)/gm, '').replace(/  /g,' ');
        }
    }

    function breakContentIntoSentences(content){
        content.sentences = [];

        const sentences = sentenceBoundaryDetection.sentences(content.sourceContentSanitized)
        sentences.forEach((sentence) => {
            content.sentences.push({
                text: sentence,
                keywords: [],
                images: []
            })
        })
    }

    function limitMaximumSentences(content){
        content.sentences = content.sentences.slice(0, content.maximumSentences);
    }

    async function fetchKeywordsOfAllSentences(content){
        for (const sentence of content.sentences){
            sentence.keywords = await fetchWatsonAndReturnKeywords(sentence.text);
        }
    }

    async function fetchWatsonAndReturnKeywords(sentence) {
        return new Promise((resolve, reject) => {
          nlu.analyze({
            text: sentence,
            features: {
              keywords: {}
            }
          }, (error, response) => {
            if (error) {
              throw error
            }
            
            const keywords = response.result.keywords.map((keyword) => {
              return keyword.text
            })
    
            resolve(keywords)
          })
        })
      }
}

module.exports = robot;