/**
 * e-Okul Bookmarklet (Yer İmi) Jeneratörü
 * Kesinlikle satır sonu (newline) içermeyen, tek satırlık, Chrome & Edge %100 uyumlu kod.
 */

const BookmarkletGenerator = (() => {

  /**
   * Tamamen sıkıştırılmış, hatasız tek satır JavaScript bookmarklet kodu
   */
  function getRawScript(questionCount) {
    // Tüm kod tek bir satırda ve sıfır satır atlamasıyla oluşturulur
    const minified = `(function(){if(document.getElementById('eokul-spead-popup')){document.getElementById('eokul-spead-popup').remove();}function findScoreInputs(){var list=[];function scanDoc(doc){if(!doc)return;try{var tdInputs=Array.from(doc.querySelectorAll('td input[type="text"],td input:not([type]),td input[type="number"],td input[type="tel"]'));var candidates=tdInputs.length>0?tdInputs:Array.from(doc.querySelectorAll('input[type="text"],input:not([type]),input[type="number"],input[type="tel"]'));candidates.forEach(function(inp){if(inp.disabled||inp.readOnly||inp.offsetParent===null)return;var name=(inp.name||inp.id||'').toLowerCase();if(name.indexOf('tarih')!==-1||name.indexOf('date')!==-1||name.indexOf('ara')!==-1||name.indexOf('search')!==-1||name.indexOf('filter')!==-1||name.indexOf('page')!==-1)return;list.push(inp);});var iframes=doc.querySelectorAll('iframe,frame');for(var i=0;i<iframes.length;i++){try{scanDoc(iframes[i].contentDocument||iframes[i].contentWindow.document);}catch(e){}}}catch(e){}}scanDoc(document);return list;}var targetInputs=findScoreInputs();var p=document.createElement('div');p.id='eokul-spead-popup';p.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:440px;background:#0f172a;color:#f8fafc;padding:22px;border-radius:18px;box-shadow:0 30px 70px rgba(0,0,0,0.85);z-index:999999999;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;border:2px solid #3b82f6;';p.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;"><h3 style="margin:0;font-size:16px;color:#60a5fa;display:flex;align-items:center;gap:8px;">⚡ e-Okul Not Doldurucu</h3><button id="eokul-c-btn" style="background:none;border:none;color:#94a3b8;font-size:22px;cursor:pointer;line-height:1;">&times;</button></div><div style="display:flex;justify-content:space-between;align-items:center;background:#1e293b;padding:8px 12px;border-radius:10px;margin-bottom:12px;font-size:12px;border:1px solid #334155;"><span>🎯 Sayfada Bulunan Not Kutucuğu:</span><strong id="eokul-detected-count" style="color:#38bdf8;font-size:14px;">'+targetInputs.length+' adet</strong></div><div style="margin-bottom:8px;font-size:12px;color:#94a3b8;">Puanları aşağıdaki kutucuğa yapıştırın (Ctrl + V):</div><textarea id="eokul-txt" rows="6" style="width:100%;box-sizing:border-box;background:#1e293b;color:#fff;border:1px solid #334155;border-radius:10px;padding:10px;font-family:monospace;font-size:13px;resize:vertical;" placeholder="Puanları buraya yapıştırın..."></textarea><div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:11px;color:#94a3b8;"><div>📥 Yapıştırılan Puan: <strong id="eokul-pasted-count" style="color:#4ade80;">0 adet</strong></div><div style="display:flex;align-items:center;gap:6px;"><label for="eokul-start-idx">Başlangıç:</label><input type="number" id="eokul-start-idx" value="1" min="1" style="width:45px;background:#1e293b;color:#fff;border:1px solid #334155;border-radius:6px;padding:2px 4px;text-align:center;"></div></div><div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end;"><button id="eokul-highlight-btn" style="background:#334155;color:#cbd5e1;border:none;padding:8px 12px;border-radius:8px;cursor:pointer;font-size:12px;">👁️ Kutucukları Göster</button><button id="eokul-paste-btn" style="background:#0284c7;color:#fff;border:none;padding:8px 12px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;">📋 Panodan Yapıştır</button><button id="eokul-run-btn" style="background:#2563eb;color:#fff;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:12px;box-shadow:0 4px 12px rgba(37,99,235,0.4);">✨ Kutucuklara Doldur</button></div><div id="eokul-msg" style="margin-top:10px;font-size:12px;text-align:center;color:#38bdf8;"></div>';document.body.appendChild(p);document.getElementById('eokul-c-btn').onclick=function(){p.remove();};function updateScoresCount(){var val=document.getElementById('eokul-txt').value.trim();var scores=val.match(/\\d+/g)||[];document.getElementById('eokul-pasted-count').textContent=scores.length+' adet';if(scores.length>0&&targetInputs.length>0){if(scores.length>targetInputs.length){document.getElementById('eokul-msg').innerHTML='<span style="color:#fbbf24;">⚠️ Dikkat: '+scores.length+' puan var ama sayfada '+targetInputs.length+' kutucuk bulundu.</span>';}else{document.getElementById('eokul-msg').innerHTML='<span style="color:#4ade80;">✓ '+scores.length+' puan '+targetInputs.length+' kutucukla eşleşti!</span>';}}}document.getElementById('eokul-txt').addEventListener('input',updateScoresCount);document.getElementById('eokul-paste-btn').onclick=async function(){try{var clip=await navigator.clipboard.readText();document.getElementById('eokul-txt').value=clip;updateScoresCount();}catch(err){alert('Panoya erişilemedi. Lütfen kutucuğa tıklayıp Ctrl + V ile yapıştırın.');}};document.getElementById('eokul-highlight-btn').onclick=function(){targetInputs.forEach(function(inp){inp.style.outline='3px solid #3b82f6';inp.style.transition='all 0.3s';setTimeout(function(){inp.style.outline='';},3000);});document.getElementById('eokul-msg').innerHTML='<span style="color:#60a5fa;">Sayfadaki '+targetInputs.length+' kutucuk mavi renkle vurgulandı!</span>';};document.getElementById('eokul-run-btn').onclick=function(){var val=document.getElementById('eokul-txt').value.trim();if(!val){alert('Lütfen önce puanları yapıştırın!');return;}var scores=val.match(/\\d+/g);if(!scores||scores.length===0){alert('Hiçbir sayı bulunamadı!');return;}targetInputs=findScoreInputs();if(targetInputs.length===0){alert('Sayfada doldurulacak not kutucuğu bulunamadı!');return;}var startIdx=(parseInt(document.getElementById('eokul-start-idx').value,10)||1)-1;if(startIdx<0)startIdx=0;var filled=0;for(var i=0;i<scores.length&&(startIdx+i)<targetInputs.length;i++){var inp=targetInputs[startIdx+i];inp.value=scores[i];inp.dispatchEvent(new Event('input',{bubbles:true}));inp.dispatchEvent(new Event('change',{bubbles:true}));inp.style.backgroundColor='#bbf7d0';inp.style.transition='background-color 0.4s';filled++;}document.getElementById('eokul-msg').innerHTML='<span style="color:#4ade80;font-weight:bold;">✅ Tam '+filled+' adet kutucuk eksiksiz dolduruldu!</span>';setTimeout(function(){p.remove();},2200);};})();`;

    return 'javascript:' + minified.trim();
  }

  function generateBookmarkletLink(questionCount) {
    return getRawScript(questionCount);
  }

  /**
   * Tarayıcıya tek tıkla içe aktarılabilir standart Chrome Bookmark HTML dosyası üretir
   */
  function generateBookmarkHtml(questionCount) {
    const raw = getRawScript(questionCount);
    return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><A HREF="${raw.replace(/"/g, '&quot;')}" ADD_DATE="${Math.floor(Date.now() / 1000)}">⚡ e-Okul Doldur</A>
</DL><p>`;
  }

  return {
    getRawScript,
    generateBookmarkletLink,
    generateBookmarkHtml
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BookmarkletGenerator;
}
if (typeof window !== 'undefined') {
  window.BookmarkletGenerator = BookmarkletGenerator;
}
