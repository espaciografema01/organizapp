/* Gramifica — capa Platform (etapa 1)
 * En navegador/TWA: Platform.isNative === false y todo se comporta como antes.
 * En Capacitor: Platform.isNative === true y se usan los plugins nativos si existen.
 * No contiene claves ni IDs: los IDs de anuncios se leerán de Firestore (config/ads).
 */
(function(){
  'use strict';
  var C = window.Capacitor || null;
  var native = false;
  try{ native = !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform()); }catch(e){}

  function plugin(name){
    try{ return (native && C && C.Plugins && C.Plugins[name]) || null; }catch(e){ return null; }
  }

  // Claves og6-* que NO deben viajar en un respaldo (son del dispositivo/sesión).
  var TRANSIENT = /^og6-(lastSync|fcm-token|fcm-token-uid|push-ok|google-redirect-pending|google-redirect-ts|dev-premium-preview|lab|reloaded-for)$/;

  function pad(n){ return (n<10?'0':'')+n; }

  var Platform = {
    isNative: native,
    plugin: plugin,
    has: function(name){ return !!plugin(name); },

    // ¿Esta clave de localStorage forma parte de un respaldo?
    isBackupKey: function(k){ return typeof k==='string' && k.indexOf('og6-')===0 && !TRANSIENT.test(k); },

    // Guarda/comparte un archivo de texto. Devuelve Promise<{ok:boolean, via:string, error?:string}>
    saveTextFile: function(filename, text, mime){
      mime = mime || 'application/json';
      var FS = plugin('Filesystem'), Share = plugin('Share');
      if(native && FS && Share){
        return FS.writeFile({ path: filename, data: text, directory: 'CACHE', encoding: 'utf8' })
          .then(function(r){ return Share.share({ title: filename, text: 'Respaldo de Gramifica', url: r.uri, dialogTitle: 'Guardar respaldo' }); })
          .then(function(){ return {ok:true, via:'share'}; })
          .catch(function(e){
            var msg = String((e && e.message) || e || '');
            if(/cancel/i.test(msg)) return {ok:false, via:'share', error:'cancelled'};
            return {ok:false, via:'share', error:msg};
          });
      }
      try{
        var blob = new Blob([text], {type: mime});
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
        return Promise.resolve({ok:true, via:'download'});
      }catch(e){ return Promise.resolve({ok:false, via:'download', error:String(e)}); }
    },

    // Stubs seguros: en navegador/TWA nunca hacen nada ni fallan.
    ads: {
      available: function(){ return false; },
      showRewarded: function(){ return Promise.resolve({ok:false, reason:'unsupported'}); }
    },
    billing: {
      available: function(){ return false; }
    },
    push: {
      available: function(){ return false; }
    }
  };

  window.Platform = Platform;
})();
