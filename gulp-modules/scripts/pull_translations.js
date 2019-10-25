const fetch = require('node-fetch');
const translations = [
	'',//'en',
];

translations.map((webhookKey) => pushingTerms(webhookKey));

async function pushingTerms(webhookKey) {
	try {
		const res = await fetch(`https://api.poeditor.com/webhooks/${webhookKey}`);
		console.info(`${webhookKey} was updated on GitHub`);
	} catch (err) {
		console.error(`Exporting was failed for ${webhookKey} language. Error ${err}`);
	}
}
