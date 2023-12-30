var singleflightCache = {};
const timeoutMs = 1000*60*60*6;

require("http").createServer(async function (req, res) {
	if (req.url == "/") {
		res.writeHead(302, {"Location": "https://www.u2b.cx/"});
		res.end();
		return;
	}

	if (req.url == "/robots.txt") {
		res.writeHead(200, {"Content-Type": "text/plain"});
		res.end(`User-agent: *\nDisallow: /\n`);
		return;
	}

	if (req.url == "/favicon.ico" || req.url.startsWith("/.")) {
		res.writeHead(404);
		res.end();
		return;
	}

	var input = decodeURIComponent(req.url.slice(1));
	var video_id = input.match(/(?:^id\/|(?:https?:\/\/)?(?:(?:www\.|music\.|m\.)?youtube\.com\/(?:watch\?v=|shorts\/|live\/)|youtu\.be\/))([A-Za-z0-9_-]{11})/)?.[1];
	
	if (!video_id) {
		var search_input = input.match(/^(.+?)(?:\/(\d*))?$/);
		if (!search_input) {
			res.writeHead(404);
			res.end();
			return;
		}
		var query = search_input[1];
		var index = search_input[2] || 1;

		var promise = singleflightCache[query];
		if (!promise) {
			promise = videoIdsFromYouTubeSearch(query);
			promise.catch(error => {
				console.error(error.stack);
			});
			promise.date = new Date();
			singleflightCache[query] = promise;
			setTimeout(() => {
				delete singleflightCache[query];
			}, timeoutMs);
		}

		try {
			var videoIds = await promise;
		} catch (error) {
			res.writeHead(302, {"Location": `https://old.u2b.cx${req.url}`});
			res.end();
			return;
		}

		video_id = videoIds[Math.min(videoIds.length-1, index)];

		if (!video_id) {
			res.writeHead(404, {"Content-Type": "text/plain"});
			res.end("No videos found");
			return;
		}
	}

	res.writeHead(302, {
		"Location": `https://www.youtube.com/watch?v=${video_id}`,
		"Expires": new Date((promise?.date?.valueOf() || Date.now()) + timeoutMs).toUTCString()
	});
	res.end();
}).listen(process.env.PORT || 8494, process.env.ADDRESS);


async function videoIdsFromYouTubeSearch(query) {
	console.log("search", query);
	return JSON.parse(
		(await fetch(`https://www.youtube.com/results?search_query=${query.replaceAll(' ', '+')}&sp=EgIQAQ%253D%253D`)
		.then(res => res.text()))
		.match(/ytInitialData = ({.*});<\/script>/)[1]
	)
	.contents
	.twoColumnSearchResultsRenderer
	.primaryContents
	.sectionListRenderer
	.contents
	.find(x => x.itemSectionRenderer?.contents.find(x => x.videoRenderer))
	.itemSectionRenderer.contents
	.filter(x => x.videoRenderer)
	.map(x => x.videoRenderer.videoId);
}