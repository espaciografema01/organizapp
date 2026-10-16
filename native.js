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

  var _pcache = {};
  function plugin(name){
    if(!native || !C) return null;
    if(_pcache[name]) return _pcache[name];
    try{
      // Con server.url el JS de los plugins no está empaquetado: se usa el puente
      // nativo de Capacitor (registerPlugin) y se comprueba que exista en Android.
      var p = C.Plugins && C.Plugins[name];
      if(!p && typeof C.registerPlugin === 'function' &&
         (typeof C.isPluginAvailable !== 'function' || C.isPluginAvailable(name))) p = C.registerPlugin(name);
      if(p) _pcache[name] = p;
      return p || null;
    }catch(e){ return null; }
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

    // Inicio de sesión nativo (solo Capacitor). Devuelve {idToken, accessToken|null}.
    // El inicio de sesión de Firebase lo completa la página con signInWithCredential.
    auth: {
      CAL_SCOPE: 'https://www.googleapis.com/auth/calendar.events',
      signInWithGoogle: function(withCalendar){
        var P = plugin('FirebaseAuthentication');
        if(!P) return Promise.reject(new Error('El inicio de sesión nativo no está disponible'));
        var opts = {skipNativeAuth: true};
        if(withCalendar) opts.scopes = [Platform.auth.CAL_SCOPE];
        return P.signInWithGoogle(opts).then(function(r){
          var c = (r && r.credential) || {};
          if(!c.idToken) throw new Error('Google no devolvió credencial');
          return {idToken: c.idToken, accessToken: c.accessToken || null};
        });
      },
      signOut: function(){
        var P = plugin('FirebaseAuthentication');
        return P ? P.signOut().catch(function(){}) : Promise.resolve();
      }
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
