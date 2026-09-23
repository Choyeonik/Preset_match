(function () {
  const HSL_KEYS = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'];
  const HSL_CENTERS = [0, 30, 60, 120, 180, 240, 275, 315];
  const AUTO = {
    exposure: 0.35, contrast: 12, highlights: -24, shadows: 18, whites: 6, blacks: -10,
    temperature: 14, tint: 4, vibrance: 16, saturation: -6,
    hsl: { red: [0, 0, 0], orange: [4, -8, 6], yellow: [-6, -10, 0], green: [10, -20, -4], aqua: [0, -10, 0], blue: [-12, -18, -6], purple: [0, 0, 0], magenta: [0, 0, 0] },
    grading: { shadows: [210, 12], midtones: [30, 6], highlights: [40, 14], balance: 0 },
    curve: [[0, 0.04], [0.25, 0.22], [0.5, 0.5], [0.75, 0.79], [1, 0.97]],
  };
  const clone = o => JSON.parse(JSON.stringify(o));

  function curveFn(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0]);
    const n = p.length;
    if (n < 2) return x => x;
    const dx = [], m = [], t = [];
    for (let i = 0; i < n - 1; i++) { dx[i] = p[i + 1][0] - p[i][0] || 1e-6; m[i] = (p[i + 1][1] - p[i][1]) / dx[i]; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = t[i + 1] = 0; continue; }
      const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    return x => {
      if (x <= p[0][0]) return p[0][1];
      if (x >= p[n - 1][0]) return p[n - 1][1];
      let i = 0; while (x > p[i + 1][0]) i++;
      const h = dx[i], u = (x - p[i][0]) / h, u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * p[i][1] + (u3 - 2 * u2 + u) * h * t[i] + (-2 * u3 + 3 * u2) * p[i + 1][1] + (u3 - u2) * h * t[i + 1];
    };
  }

  const VS = 'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
  const FS = `precision highp float;varying vec2 v;
uniform sampler2D img,lut;uniform float ex,co,hi,sh,wh,bl,te,ti,vi,sa,st,sp,bal;
uniform vec3 hsl[8];uniform float hc[8];uniform vec2 gS,gM,gH;
vec3 rgb2hsv(vec3 c){vec4 K=vec4(0.,-1./3.,2./3.,-1.);vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));float d=q.x-min(q.w,q.y);float e=1e-10;return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)),d/(q.x+e),q.x);}
vec3 hsv2rgb(vec3 c){vec4 K=vec4(1.,2./3.,1./3.,3.);vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www);return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y);}
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec3 tintOf(float h){vec3 k=hsv2rgb(vec3(h,1.,1.));return k-vec3(lum(k));}
void main(){
vec3 o=texture2D(img,v).rgb;vec3 c=o*exp2(ex);float L=lum(c);
c+=bl*.12*(1.-smoothstep(0.,.35,L));c+=wh*.12*smoothstep(.6,1.,L);
c+=sh*.28*(1.-smoothstep(0.,.55,L))*(1.-L);c+=hi*.28*smoothstep(.45,1.,L);
c=(c-.5)*(1.+co*.8)+.5;
c.r+=te*.08;c.b-=te*.08;c.g-=ti*.07;c.r+=ti*.03;c.b+=ti*.03;
c=clamp(c,0.,1.);
vec3 h=rgb2hsv(c);float hd=h.x*360.;float dh=0.,ds=0.,dl=0.;
for(int i=0;i<8;i++){float d=abs(mod(hd-hc[i]+180.,360.)-180.);float w=max(0.,1.-d/42.);dh+=w*hsl[i].x;ds+=w*hsl[i].y;dl+=w*hsl[i].z;}
h.x=fract(h.x+dh*30./360.+1.);h.y=clamp(h.y*(1.+ds),0.,1.);h.z=clamp(h.z*(1.+dl*.5*h.y),0.,1.);
h.y=clamp(h.y*(1.+vi*(1.-h.y)),0.,1.);h.y=clamp(h.y*(1.+sa),0.,1.);
c=hsv2rgb(h);L=lum(c);float pv=.5+bal*.3;
float ws=1.-smoothstep(0.,pv,L);float wH=smoothstep(pv,1.,L);float wm=clamp(1.-ws-wH,0.,1.);
c+=tintOf(gS.x)*gS.y*ws*.4+tintOf(gM.x)*gM.y*wm*.3+tintOf(gH.x)*gH.y*wH*.4;
c=clamp(c,0.,1.);
c=vec3(texture2D(lut,vec2(c.r,.5)).r,texture2D(lut,vec2(c.g,.5)).r,texture2D(lut,vec2(c.b,.5)).r);
c=mix(o,c,st);if(v.x<sp)c=o;gl_FragColor=vec4(c,1.);}`;

  function createRenderer(canvas) {
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) return null;
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(x)); return x; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = n => gl.getUniformLocation(pr, n);
    const mkTex = unit => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(k => gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); return t; };
    const imgTex = mkTex(0), lutTex = mkTex(1);
    gl.uniform1i(U('img'), 0); gl.uniform1i(U('lut'), 1);
    gl.uniform1fv(U('hc'), new Float32Array(HSL_CENTERS));
    let ready = false, lastCurve = '';
    return {
      setImage(im) {
        const max = 2400, s = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
        canvas.width = Math.round(im.naturalWidth * s); canvas.height = Math.round(im.naturalHeight * s);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, imgTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im);
        ready = true;
      },
      render(P, strength, split) {
        if (!ready) return;
        const key = JSON.stringify(P.curve);
        if (key !== lastCurve) {
          lastCurve = key; const f = curveFn(P.curve), d = new Uint8Array(256);
          for (let i = 0; i < 256; i++) d[i] = Math.max(0, Math.min(255, Math.round(f(i / 255) * 255)));
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, lutTex);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 256, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, d);
        }
        const f = (n, x) => gl.uniform1f(U(n), x);
        f('ex', P.exposure); f('co', P.contrast / 100); f('hi', P.highlights / 100); f('sh', P.shadows / 100);
        f('wh', P.whites / 100); f('bl', P.blacks / 100); f('te', P.temperature / 100); f('ti', P.tint / 100);
        f('vi', P.vibrance / 100); f('sa', P.saturation / 100); f('st', strength); f('sp', split); f('bal', P.grading.balance / 100);
        const arr = []; HSL_KEYS.forEach(k => arr.push(P.hsl[k][0] / 100, P.hsl[k][1] / 100, P.hsl[k][2] / 100));
        gl.uniform3fv(U('hsl'), new Float32Array(arr));
        const g = P.grading;
        gl.uniform2f(U('gS'), g.shadows[0] / 360, g.shadows[1] / 100);
        gl.uniform2f(U('gM'), g.midtones[0] / 360, g.midtones[1] / 100);
        gl.uniform2f(U('gH'), g.highlights[0] / 360, g.highlights[1] / 100);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
      toBlob(type, cb) { canvas.toBlob(cb, type, 0.95); },
    };
  }

  function scaled(P, s) {
    const q = clone(P), m = v => Math.round(v * s * 100) / 100;
    ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'temperature', 'tint', 'vibrance', 'saturation'].forEach(k => q[k] = m(P[k]));
    HSL_KEYS.forEach(k => q.hsl[k] = P.hsl[k].map(m));
    ['shadows', 'midtones', 'highlights'].forEach(k => q.grading[k] = [P.grading[k][0], m(P.grading[k][1])]);
    q.grading.balance = m(P.grading.balance);
    q.curve = P.curve.map(([x, y]) => [x, x + (y - x) * s]);
    return q;
  }

  function buildXMP(P, strength, name) {
    const q = scaled(P, strength), r = v => Math.round(v);
    const cap = s => s[0].toUpperCase() + s.slice(1);
    const a = {
      'crs:Version': '15.0', 'crs:ProcessVersion': '11.0', 'crs:PresetType': 'Normal', 'crs:HasSettings': 'True',
      'crs:Exposure2012': (q.exposure >= 0 ? '+' : '') + q.exposure.toFixed(2), 'crs:Contrast2012': r(q.contrast),
      'crs:Highlights2012': r(q.highlights), 'crs:Shadows2012': r(q.shadows), 'crs:Whites2012': r(q.whites), 'crs:Blacks2012': r(q.blacks),
      'crs:IncrementalTemperature': r(q.temperature), 'crs:IncrementalTint': r(q.tint), 'crs:Vibrance': r(q.vibrance), 'crs:Saturation': r(q.saturation),
      'crs:ColorGradeShadowHue': r(q.grading.shadows[0]), 'crs:ColorGradeShadowSat': r(q.grading.shadows[1]),
      'crs:ColorGradeMidtoneHue': r(q.grading.midtones[0]), 'crs:ColorGradeMidtoneSat': r(q.grading.midtones[1]),
      'crs:ColorGradeHighlightHue': r(q.grading.highlights[0]), 'crs:ColorGradeHighlightSat': r(q.grading.highlights[1]),
      'crs:SplitToningBalance': r(q.grading.balance),
    };
    HSL_KEYS.forEach(k => { a['crs:HueAdjustment' + cap(k)] = r(q.hsl[k][0]); a['crs:SaturationAdjustment' + cap(k)] = r(q.hsl[k][1]); a['crs:LuminanceAdjustment' + cap(k)] = r(q.hsl[k][2]); });
    const attrs = Object.entries(a).map(([k, v]) => `    ${k}="${v}"`).join('\n');
    const curve = q.curve.slice().sort((x, y) => x[0] - y[0]).map(([x, y]) => `      <rdf:li>${r(x * 255)}, ${r(Math.max(0, Math.min(1, y)) * 255)}</rdf:li>`).join('\n');
    return `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Retone">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
${attrs}>
   <crs:Name><rdf:Alt><rdf:li xml:lang="x-default">${name}</rdf:li></rdf:Alt></crs:Name>
   <crs:ToneCurvePV2012><rdf:Seq>
${curve}
   </rdf:Seq></crs:ToneCurvePV2012>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
`;
  }

  window.RetoneCore = { AUTO, HSL_KEYS, HSL_CENTERS, clone, curveFn, createRenderer, buildXMP };
})();
