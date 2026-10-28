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
    build: '2026.10.28.diag',
    // Texto de diagnóstico (plugins nativos que la app ve). Se muestra en Actividad → Ajustes avanzados.
    diag: function(){
      var l = [];
      try{
        var hdr = (C && C.PluginHeaders) ? C.PluginHeaders.map(function(h){ return h.name; }) : [];
        l.push('native.js: ' + Platform.build);
        l.push('App nativa: ' + (native ? 'sí' : 'no'));
        ['GrGeo','GrTimer','GramificaWidget','GrSecure','BiometricAuth','AdMob'].forEach(function(n){
          l.push(n + ': ' + (hdr.indexOf(n) >= 0 ? 'registrado' : 'NO registrado') + (native && plugin(n) ? ' · disponible' : ' · no disponible'));
        });
        l.push('GPS nativo disponible: ' + (Platform.geo && Platform.geo.available() ? 'sí' : 'no'));
        l.push('Todos los plugins: ' + (hdr.join(', ') || '(ninguno)'));
      }catch(e){ l.push('error: ' + e); }
      return l.join('\n');
    },
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

    // Guarda/comparte un archivo binario (Blob), p. ej. una imagen PNG. En nativo abre el menú de compartir.
    saveBlobFile: function(filename, blob, mime){
      var FS = plugin('Filesystem'), Share = plugin('Share');
      if(native && FS && Share){
        return new Promise(function(ok, fail){
          var fr = new FileReader();
          fr.onerror = function(){ fail(new Error('No se pudo leer el archivo')); };
          fr.onload = function(){ ok(String(fr.result).split(',')[1] || ''); };
          fr.readAsDataURL(blob);
        }).then(function(b64){
          return FS.writeFile({ path: filename, data: b64, directory: 'CACHE' });
        }).then(function(r){
          return Share.share({ title: filename, url: r.uri, dialogTitle: 'Guardar o compartir' });
        }).then(function(){ return {ok:true, via:'share'}; })
          .catch(function(e){
            var msg = String((e && e.message) || e || '');
            return {ok:false, via:'share', error: /cancel/i.test(msg) ? 'cancelled' : msg};
          });
      }
      try{
        var url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
        return Promise.resolve({ok:true, via:'download'});
      }catch(e){ return Promise.resolve({ok:false, via:'download', error:String(e)}); }
    },

    // Pantalla encendida (timer, respiración). En nativo usa el plugin KeepAwake si está.
    keepAwake: {
      available: function(){ return native && !!plugin('KeepAwake'); },
      on: function(){ var P = plugin('KeepAwake'); return P ? P.keepAwake().catch(function(){}) : Promise.resolve(); },
      off: function(){ var P = plugin('KeepAwake'); return P ? P.allowSleep().catch(function(){}) : Promise.resolve(); }
    },

    // Bloquea capturas de pantalla y la vista previa en apps recientes (plugin propio GrSecure, FLAG_SECURE).
    secure: {
      set: function(on){
        var P = plugin('GrSecure');
        if(P) try{ P.setSecure({on: !!on}).catch(function(){}); }catch(e){}
      }
    },

    // Huella / rostro para el espacio oculto. Plugin @aparajita/capacitor-biometric-auth ('BiometricAuth').
    // `available` pasa a true solo si el plugin existe Y el teléfono tiene huella/rostro registrados;
    // si no, el espacio oculto sigue funcionando solo con código (PIN).
    biometric: {
      available: false,
      verify: function(reason){
        var P = plugin('BiometricAuth');
        if(!P) return Promise.resolve(false);
        return P.authenticate({reason: reason || 'Confirma tu identidad', androidTitle: 'Gramifica', androidSubtitle: reason || '', cancelTitle: 'Usar código', allowDeviceCredential: false})
          .then(function(){ return true; }).catch(function(){ return false; });
      }
    },

    // Temporizador con pantalla bloqueada: servicio nativo (plugin propio GrTimer) que reproduce
    // sonidos WAV y vibra a horas programadas. Solo existe en la app nativa con el plugin instalado.
    timer: {
      available: function(){ return native && !!plugin('GrTimer'); },
      prepare: function(sounds){ var P = plugin('GrTimer'); return P ? P.prepare({sounds: sounds}) : Promise.resolve(); },   // {clave: base64 WAV}
      schedule: function(events){ var P = plugin('GrTimer'); return P ? P.schedule({events: events}) : Promise.resolve(); }, // [{at: epochMs, sound: clave|null, vib: [ms]|null}]
      cancel: function(keepAlive){ var P = plugin('GrTimer'); return P ? P.cancel({keepAlive: !!keepAlive}).catch(function(){}) : Promise.resolve(); },
      stop: function(){ var P = plugin('GrTimer'); return P ? P.stop().catch(function(){}) : Promise.resolve(); }
    },

    // GPS con la pantalla apagada: servicio nativo en primer plano (plugin propio GrGeo).
    // Mismo contrato que usa el index: start(onPoint(lat,lon,acc,alt,ts), onError(msg)) / stop().
    geo: (function(){
      var h = [], next = 0, lastTs = 0, onP = null, onE = null, vis = null;
      function feed(p){ var ts = +p.ts || Date.now(); if(ts <= lastTs) return; lastTs = ts; if(onP) onP(p.lat, p.lon, p.acc, (p.alt==null?null:p.alt), ts); }
      function drain(){ var P = plugin('GrGeo'); if(!P || !onP) return; P.drain({since: next}).then(function(r){ (r.points||[]).forEach(feed); if(r && r.next!=null) next = r.next; }).catch(function(){}); }
      return {
        available: function(){ return native && !!plugin('GrGeo'); },
        start: function(onPoint, onError){
          var P = plugin('GrGeo'); onP = onPoint; onE = onError; lastTs = 0; next = 0;
          P.addListener('point', function(p){ feed(p); if(p.seq!=null) next = p.seq + 1; }).then(function(x){ h.push(x); });
          P.addListener('error', function(e){ if(onE) onE(e && e.msg); }).then(function(x){ h.push(x); });
          vis = function(){ if(!document.hidden) drain(); }; document.addEventListener('visibilitychange', vis);
          P.start().then(function(r){ if(r && r.seq!=null) next = r.seq; }).catch(function(e){ if(onE) onE(String(e && e.message || e).indexOf('denied')>=0 ? 'Permiso de ubicación denegado: actívalo en los ajustes' : 'No se pudo iniciar el GPS'); });
        },
        stop: function(){
          var P = plugin('GrGeo'); if(vis){ document.removeEventListener('visibilitychange', vis); vis = null; }
          h.forEach(function(x){ try{ x.remove(); }catch(e){} }); h = []; onP = onE = null;
          if(P) P.stop().catch(function(){});
        }
      };
    })(),

    // Vibración. En nativo usa Haptics (un patrón [v,p,v,...] se reproduce por tramos).
    vibrate: function(pattern){
      var H = plugin('Haptics');
      if(!(native && H)){ try{ if(navigator.vibrate) navigator.vibrate(pattern); }catch(e){} return; }
      var seq = Array.isArray(pattern) ? pattern : [pattern];
      var t = 0;
      seq.forEach(function(ms, i){
        ms = Math.max(1, +ms || 0);
        if(i % 2 === 0){ setTimeout(function(){ try{ H.vibrate({duration: ms}); }catch(e){} }, t); }
        t += ms;
      });
    },

    // Abrir enlaces: https en el navegador del sistema; esquemas propios (strava://, shortcuts://…) con AppLauncher.
    openUrl: function(url){
      var B = plugin('Browser'), L = plugin('AppLauncher');
      if(native && /^https?:/i.test(url) && B){ return B.open({url: url}).catch(function(){ window.open(url, '_blank', 'noopener'); }); }
      if(native && L){
        // AppLauncher no rechaza si ninguna app maneja el enlace: devuelve {completed:false}. En ese caso se
        // intenta por navegación (el puente de Capacitor lanza un Intent para esquemas que no son del sitio).
        return L.openUrl({url: url}).then(function(r){
          if(r && r.completed === false){ try{ window.location.href = url; }catch(e){} }
        }).catch(function(){ try{ window.location.href = url; }catch(e){} });
      }
      try{ if(/^https?:/i.test(url)) window.open(url, '_blank', 'noopener'); else window.location.href = url; }catch(e){}
      return Promise.resolve();
    },

    // Inicio de sesión nativo (solo Capacitor). Devuelve {idToken, accessToken|null}.
    // El inicio de sesión de Firebase lo completa la página con signInWithCredential.
    auth: {
      CAL_SCOPE: 'https://www.googleapis.com/auth/calendar.events',
      signInWithGoogle: function(withCalendar){
        var P = plugin('FirebaseAuthentication');
        if(!P){
          var msg = 'Plugin de sesión no disponible. ';
          try{
            var list = (C && C.PluginHeaders ? C.PluginHeaders.map(function(h){return h.name;}) : []);
            var want = ['FirebaseAuthentication','Filesystem','Share','Browser','Haptics','App'];
            var missing = want.filter(function(n){ return list.indexOf(n) < 0; });
            msg += 'Total: '+list.length+'. Faltan: '+(missing.join(',')||'ninguno')+'.';
          }catch(e){ msg += 'No se pudo leer la lista.'; }
          return Promise.reject(new Error(msg));
        }
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

    // Anuncios con recompensa (AdMob) con @capacitor-community/admob. En navegador/TWA nunca hacen nada.
    // Los IDs de anuncio NO están aquí: la página los lee de Firestore (config/ads) y los pasa a showRewarded.
    ads: (function(){
      var ready = null;
      function pl(){ return plugin('AdMob'); }
      // Inicializa el SDK y pide el consentimiento (UMP) si hace falta. Devuelve true si se pueden pedir anuncios.
      function init(){
        if(ready) return ready;
        var P = pl();
        if(!P) return Promise.resolve(false);
        ready = P.initialize({}).then(function(){
          return P.requestConsentInfo({}).then(function(info){
            if(info && info.canRequestAds === false && info.isConsentFormAvailable){
              return P.showConsentForm().then(function(i2){ return !(i2 && i2.canRequestAds === false); });
            }
            return !(info && info.canRequestAds === false);
          }, function(){ return true; }); // si el consentimiento falla (p. ej. sin red), el propio SDK decidirá
        }).catch(function(){ ready = null; return false; });
        return ready;
      }
      return {
        available: function(){ return native && !!pl(); },
        // opts: {adId, testing, userId, customData}. Resuelve {ok:true} cuando el anuncio terminó de mostrarse
        // (la recompensa real la confirma el servidor) o {ok:false, reason}.
        showRewarded: function(opts){
          var P = pl();
          if(!P) return Promise.resolve({ok:false, reason:'unsupported'});
          if(!opts || !opts.adId) return Promise.resolve({ok:false, reason:'no-config'});
          return init().then(function(can){
            if(!can) return {ok:false, reason:'consent'};
            var o = {adId: opts.adId, isTesting: !!opts.testing, ssv: {userId: opts.userId, customData: opts.customData}};
            return P.prepareRewardVideoAd(o).then(function(){
              return P.showRewardVideoAd();
            }).then(function(){ return {ok:true}; });
          }).catch(function(e){
            return {ok:false, reason:'error', error:String((e && (e.message || e.code)) || e || '')};
          });
        },
        // Pantalla de opciones de privacidad de anuncios (UMP), si el usuario la tiene disponible.
        privacyOptions: function(){
          var P = pl();
          if(!P) return Promise.resolve(false);
          return init().then(function(){ return P.showPrivacyOptionsForm(); }).then(function(){ return true; }).catch(function(){ return false; });
        }
      };
    })(),
    // Compras nativas (Google Play Billing) con el plugin @capgo/native-purchases.
    billing: {
      available: function(){ return native && !!plugin('NativePurchases'); },
      // Compra el producto. Suscripción: elige la primera oferta/plan base disponible.
      // Devuelve la transacción (con purchaseToken) o null si el producto no existe en Play.
      buy: function(sku, oneTime){
        var P = plugin('NativePurchases');
        if(!P) return Promise.reject(new Error('Compras no disponibles'));
        var type = oneTime ? 'inapp' : 'subs';
        return P.getProducts({productIdentifiers: [sku], productType: type}).then(function(r){
          var list = (r && r.products) || [];
          var prod = oneTime ? list[0] : (list.filter(function(x){ return x.offerToken; })[0] || list[0]);
          if(!prod) return null;
          var opts = {productIdentifier: sku, productType: type, quantity: 1, autoAcknowledgePurchases: true};
          if(!oneTime){
            opts.planIdentifier = prod.planIdentifier || prod.identifier;
            if(prod.offerToken) opts.offerToken = prod.offerToken;
          } else {
            opts.isConsumable = true; // una donación se puede repetir
          }
          return P.purchaseProduct(opts);
        });
      },
      // Compras de suscripción del usuario en Google Play (para renovar el estado al abrir la app).
      subscriptions: function(){
        var P = plugin('NativePurchases');
        if(!P) return Promise.resolve([]);
        return P.getPurchases({productType: 'subs'}).then(function(r){ return (r && r.purchases) || []; });
      }
    },
    // Avisos push nativos (solo Capacitor): permiso, token FCM y aviso en primer plano.
    push: (function(){
      var token = null, waiters = [], bound = false;
      function pl(){ return plugin('PushNotifications'); }
      function norm(v){ return v === 'granted' ? 'granted' : (v === 'denied' ? 'denied' : 'default'); }
      function bind(){
        var p = pl(); if(!p || bound) return; bound = true;
        p.addListener('registration', function(t){
          token = t && t.value || null;
          waiters.splice(0).forEach(function(w){ w.ok(token); });
        });
        p.addListener('registrationError', function(e){
          waiters.splice(0).forEach(function(w){ w.fail(new Error((e && e.error) || 'registro de avisos')); });
        });
        p.addListener('pushNotificationReceived', function(n){
          try{ if(typeof Platform.push.onForeground === 'function') Platform.push.onForeground(n); }catch(e){}
        });
        try{ p.createChannel({id:'gramifica', name:'Recordatorios', description:'Avisos de tareas y recordatorios', importance:4, visibility:1}).catch(function(){}); }catch(e){}
      }
      return {
        onForeground: null,
        available: function(){ return native && !!pl(); },
        checkPermission: function(){
          var p = pl(); if(!p) return Promise.resolve('unsupported');
          return p.checkPermissions().then(function(r){ return norm(r && r.receive); });
        },
        requestPermission: function(){
          var p = pl(); if(!p) return Promise.resolve('unsupported');
          return p.requestPermissions().then(function(r){ return norm(r && r.receive); });
        },
        getToken: function(){
          var p = pl(); if(!p) return Promise.reject(new Error('Avisos nativos no disponibles'));
          bind();
          if(token) return Promise.resolve(token);
          return new Promise(function(ok, fail){
            var w = {ok: ok, fail: fail}; waiters.push(w);
            setTimeout(function(){ var i = waiters.indexOf(w); if(i >= 0){ waiters.splice(i,1); fail(new Error('Tiempo agotado al registrar avisos')); } }, 20000);
            p.register().catch(function(e){ var i = waiters.indexOf(w); if(i >= 0) waiters.splice(i,1); fail(e); });
          });
        }
      };
    })()
  };

    try{
    var _bio = native && plugin('BiometricAuth');
    if(_bio && _bio.checkBiometry) _bio.checkBiometry().then(function(r){ Platform.biometric.available = !!(r && r.isAvailable); }).catch(function(){});
  }catch(e){}

window.Platform = Platform;
})();
