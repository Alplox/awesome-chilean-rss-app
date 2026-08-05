import { allFeeds, filters, categories, regions } from './state.js';
import { isFeedDownloadable } from './filters.js';
import { t } from './i18n.js';

export function downloadFeeds(grouped) {
  let selected = [];
  for (let i = 0; i < allFeeds.length; i++) {
    if (isFeedDownloadable(allFeeds[i])) {
      selected.push(allFeeds[i]);
    }
  }

  if (selected.length === 0) return;

  let suffix = grouped ? '' : '-flat';
  if (filters.format === 'opml') {
    let opml = generateOPML(selected, grouped);
    downloadFile(opml, 'awesome-chilean-rss' + suffix + '.opml', 'application/xml');
  } else {
    let html = generateHTMLBookmarks(selected, grouped);
    downloadFile(html, 'awesome-chilean-rss' + suffix + '.html', 'text/html');
  }
}

function generateOPML(feeds, grouped) {
  let body = '';

  if (grouped) {
    let groupedFeeds = {};
    let groupKey, label;
    for (let i = 0; i < feeds.length; i++) {
      let feed = feeds[i];
      if (filters.groupByRegion) {
        groupKey = feed.region || 'uncategorized';
        label = regions[groupKey] || t('uncategorized');
      } else {
        groupKey = feed.category || 'uncategorized';
        label = categories[groupKey]
          ? categories[groupKey].label.replace(/\p{Emoji}/gu, '').replace(/\p{Variation_Selector}/gu, '').trim()
          : t('uncategorized');
      }
      if (!groupedFeeds[groupKey]) groupedFeeds[groupKey] = [];
      groupedFeeds[groupKey].push(feed);
    }

    let keys = Object.keys(groupedFeeds).sort();
    for (let g = 0; g < keys.length; g++) {
      let key = keys[g];
      let groupLabel = filters.groupByRegion ? (regions[key] || t('uncategorized')) : (categories[key]
        ? categories[key].label.replace(/\p{Emoji}/gu, '').replace(/\p{Variation_Selector}/gu, '').trim()
        : t('uncategorized'));
      body += '    <outline text="' + escXml(groupLabel) + '" title="' + escXml(groupLabel) + '">\n';
      let groupFeeds = groupedFeeds[key];
      for (let f = 0; f < groupFeeds.length; f++) {
        body += '      <outline type="rss" text="' + escXml(groupFeeds[f].feedName) + '" title="' + escXml(groupFeeds[f].feedName) + '" xmlUrl="' + escXml(groupFeeds[f].rssUrl) + '" htmlUrl="' + escXml(groupFeeds[f].htmlUrl) + '"/>\n';
      }
      body += '    </outline>\n';
    }
  } else {
    for (let u = 0; u < feeds.length; u++) {
      body += '    <outline type="rss" text="' + escXml(feeds[u].feedName) + '" title="' + escXml(feeds[u].feedName) + '" xmlUrl="' + escXml(feeds[u].rssUrl) + '" htmlUrl="' + escXml(feeds[u].htmlUrl) + '"/>\n';
    }
  }

  return '<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>awesome-chilean-rss</title>\n  </head>\n  <body>\n' + body + '  </body>\n</opml>';
}

function generateHTMLBookmarks(feeds, grouped) {
  let items = '';
  if (grouped) {
    let groupedFeeds = {};
    let groupKey;
    for (let i = 0; i < feeds.length; i++) {
      let feed = feeds[i];
      if (filters.groupByRegion) {
        groupKey = feed.region || 'uncategorized';
      } else {
        groupKey = feed.category || 'uncategorized';
      }
      if (!groupedFeeds[groupKey]) groupedFeeds[groupKey] = [];
      groupedFeeds[groupKey].push(feed);
    }

    let keys = Object.keys(groupedFeeds).sort();
    for (let g = 0; g < keys.length; g++) {
      let key = keys[g];
      let groupLabel = filters.groupByRegion ? (regions[key] || t('uncategorized')) : (categories[key]
        ? categories[key].label.replace(/\p{Emoji}/gu, '').replace(/\p{Variation_Selector}/gu, '').trim()
        : t('uncategorized'));
      items += '  <DT><H3>' + escHtml(groupLabel) + '</H3>\n  <DL><p>\n';
      let groupFeeds = groupedFeeds[key];
      for (let f = 0; f < groupFeeds.length; f++) {
        let feed = groupFeeds[f];
        items += '    <DT><A HREF="' + escHtml(feed.htmlUrl) + '">' + escHtml(feed.feedName + ' - ' + feed.siteName) + '</A>\n';
      }
      items += '  </DL><p>\n';
    }
  } else {
    for (let i = 0; i < feeds.length; i++) {
      let f = feeds[i];
      items += '  <DT><A HREF="' + escHtml(f.htmlUrl) + '">' + escHtml(f.feedName + ' - ' + f.siteName) + '</A>\n';
    }
  }

  return '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>awesome-chilean-rss</TITLE>\n<H1>awesome-chilean-rss</H1>\n<DL><p>\n' + items + '</DL><p>';
}

function downloadFile(content, filename, mimeType) {
  let blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
  let url = URL.createObjectURL(blob);
  let a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escXml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function escHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
