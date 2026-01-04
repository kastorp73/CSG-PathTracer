
const header = `#version 300 es
precision highp float;
uniform vec3 iResolution;
uniform float iTime;
uniform int iFrame;
uniform vec4 iMouse;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;
out vec4 fragColor;
`;

export const bufferAShader = `${header}
// ============================================================
// Buffer A: Scene / Camera Logic
// ============================================================
#define LAMBERTIAN 0.
#define METAL 1.
#define DIELECTRIC 2.
const float PI = 3.1415926535897932384626433832795;

void mainImage(out vec4 fragColor, in vec2 fragCoord);

void main() {
    mainImage(fragColor, gl_FragCoord.xy);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    ivec2 p = ivec2(fragCoord);
    if(p.y < 0 || p.y > 5) discard;
    
    // Persist previous frame's data (uploaded via JS or computed here)
    fragColor = texelFetch(iChannel0, p, 0);

    // Camera and Interaction Logic
    if(p.y == 5){
        #define key(k) (texelFetch(iChannel3,ivec2(k,0),0).x>.5)
        bool reset=false;
        vec2 mo = iMouse.xy == vec2(0) ? vec2(.0) : abs(iMouse.xy)/iResolution.xy - .5;      
        vec4 data = texelFetch(iChannel0, ivec2(0,5), 0);
        if (round(mo*iResolution.xy) != round(data.yz) || round(data.w) != round(iResolution.x)) {
            reset = true;
        }
        reset = reset || (iMouse.x < .0) || (iMouse.z > 0.0);
        
        vec4 ta = iFrame==0?vec4(0.,0,0,1.4):texelFetch(iChannel0,ivec2(2,5),0);
        vec2 m = (iMouse.xy/iResolution.xy);
        vec2 a = (iMouse.x>0.0 || reset)? vec2( m.x*PI*2.,m.y*PI*.5): vec2(float(iFrame)/120.,0.5);   
        vec3 rd = vec3(cos(a.x)*cos(a.y), sin(a.y), sin(a.x)*cos(a.y));
        vec3 ro = ta.xyz + rd*ta.w*9.;
        
        if(key(87)) {ta.xz-=.2*normalize((rd).xz);reset=true;}
        if(key(83)) {ta.xz+=.2*normalize((rd).xz);;reset=true;}
        if(key(65)) {ta.xz+=.2*normalize(cross(rd,vec3(0,1,0)).xz);reset=true;}
        if(key(68)) {ta.xz-=.2*normalize(cross(rd,vec3(0,1,0)).xz);reset=true;}
        if(key(81)) {ta.w=min(ta.w*1.1,6.);reset=true;}
        if(key(69)) {ta.w=max(ta.w/1.1,.7);reset=true;}
        
        if(p.x==0) fragColor = vec4(reset,mo*iResolution.xy,iResolution.x);
        else if(p.x==1) fragColor=vec4(ro,0);
        else if(p.x==2) fragColor=ta;
    }
}
`;

export const mainShader = `${header}
// ============================================================
// Main Pass: CSG Path Tracer (Linear Color)
// ============================================================

#define PATHTRACE
#define PATH_LENGTH 4
#define ZERO min(0,iFrame)
#define TOLERANCE 1e-4
#define ITERATIONS 20
#define VAXIS vec3(0,1,0)
#define NOHIT 1e10
#define QUANTIZATION 4.
#define LAMBERTIAN 0.
#define METAL 1.
#define DIELECTRIC 2.
const float PI = 3.1415926535897932384626433832795;

struct Hit { float t; vec3 n; };
struct Span { Hit n; Hit f; float mat; };

Hit NO_HIT() { return Hit(NOHIT, vec3(0.0)); }
Span NO_SPAN() { Hit h = NO_HIT(); return Span(h,h,0.0); }

vec3 supMax(vec3 d, vec3 a, vec3 b){ return dot(d,a) > dot(d,b) ? a : b; }
struct sup { vec3 c; vec3 b; int s; };

vec2 octEncode(vec3 n) {
    n /= (abs(n.x) + abs(n.y) + abs(n.z));
    vec2 e = n.xy;
    if (n.z < 0.0) e = (1.0 - abs(e.yx)) * sign(e.xy);
    return e;
}

vec3 octDecode(vec2 e) {
    vec3 n = vec3(e.xy, 1.0 - abs(e.x) - abs(e.y));
    if (n.z < 0.0) n.xy = (1.0 - abs(n.yx)) * sign(n.xy);
    return normalize(n);
}

vec3 octahedral(vec3 dir, float M) {
    vec3 n = normalize(dir);
    vec2 e = octEncode(n);
    vec2 u = e*0.5 + 0.5;
    u = (floor(u*M) + 0.5) / M;
    e = u*2.0 - 1.0;
    return octDecode(e);
}

vec3 support(vec3 dir, sup o, inout mat3 rm){
    vec3 s = vec3(0.0);
    dir = dir * rm;
    vec3 dbn = normalize(dir * o.b);
    switch(o.s){
        case 0: s = sign(dir) * o.b; break;
        case 1: s = octahedral(dbn, QUANTIZATION*8.)*o.b; break;
        case 2: {
             float a = atan(dir.x, dir.y), f = PI / QUANTIZATION;
             a = (floor(a/f)+.5)*f;
             s = supMax(dir, vec3(sin(a) * o.b.x,cos(a)* o.b.x,  o.b.y), vec3(sin(a) * o.b.x,cos(a)* o.b.x, -o.b.y));
             break;
        }
        case 3: {
             float a = atan(dir.x, dir.y), f = PI / QUANTIZATION;
             a = (floor(a/f)+.5)*f;
             s = supMax(dir, vec3(sin(a) * o.b.x,cos(a)* o.b.x,  o.b.z), vec3(0.0, 0.0, -o.b.z));
             break;
        }
        case 4: s = supMax(dir, (o.b-.1), -(o.b-.1)) + normalize(dir) * .1; break;
    }
    return s * transpose(rm) + o.c;
}

Span iSupportFunction(vec3 ro, vec3 rd, vec3 bb, int sh, bool csg) {
    Span noHit = NO_SPAN();
    vec3 dir, tmp, a, b, c, d;
    vec3 rx = normalize(cross(rd, VAXIS));
    vec3 ry = cross(rx, rd);
    mat3 rmai = mat3(rx,ry,rd), rma = transpose(rmai);
    float d0 = -dot(ro, rd);
    ro *= rmai; rd = vec3(0,0,1);
    sup o; o.b = bb; o.s = int(sh); o.c = cross(cross(rd, ro), rd);
    #define perp2d(v) ((v).yx*vec2(-1,1))
    a = o.c; b = support(vec3(-a.xy, 0.), o,rma);
    if(dot(-a.xy, b.xy) <= 0.0) return noHit;
    dir = vec3(perp2d(b-a), 0.0);
    if(dot(dir.xy, a.xy) >= 0.0){ dir.xy *= -1.0; tmp = a; a = b; b = tmp; }
    c = support(dir, o,rma);
    if(dot(c.xy, dir.xy) <= 0.0) return noHit;
    for(int i=0; i<6; ++i){
        if(dot(dir.xy = perp2d(c-a), c.xy) < 0.0)      { b = c; }
        else if(dot(dir.xy = perp2d(b-c), c.xy) < 0.0) { a = c; }
        else break;
        c = support(dir, o,rma);
        if(dot(c.xy, dir.xy) <= 0.0) return noHit;
    }
    Hit iN, iF=NO_HIT();
    for(int j=0; j<=(csg?1:0); j++){
        for(int i=0; i<ITERATIONS; ++i){
            dir = normalize(cross(b-a, c-a));
            if(j>0) dir *= -1.0;
            d = support(dir, o,rma);
            if(abs(dot(dir, d) - dot(dir, a)) < TOLERANCE) break;
            bool ad = dot(perp2d(d-a), d.xy) > 0.0;
            bool bd = dot(perp2d(d-b), d.xy) > 0.0;
            bool cd = dot(perp2d(d-c), d.xy) > 0.0;
            if(ad && !bd)      { c = d; }
            else if(bd && !cd) { a = d; }
            else if(cd && !ad) { b = d; }
            else break;
        }
        vec3 normal = -normalize(cross(b-a, c-a));
        float depth = a.z + dot(a.xy, normal.xy)/normal.z;
        normal *= rma;
        Hit it = Hit(-depth + d0, normal);
        if(j==0) iN = it; else iF = it;
    }
    return Span(iN, iF, 0.0);
}

struct RayOut { float d; vec3 n; float id; };
RayOut NO_RAY() { return RayOut(NOHIT, vec3(0.0), 0.0); }
bool spanAny(in Span s) { return s.n.t < NOHIT*0.5; }
bool spanSel(in Span s) { return (s.n.t > TOLERANCE) && (s.n.t < NOHIT*0.5) && (s.f.t > TOLERANCE); }
void FastAdd(inout RayOut a, RayOut b){ if(b.d < a.d) a = b; }
RayOut rayFromSpan(Span s){ if(!spanSel(s)) return NO_RAY(); return RayOut(s.n.t, s.n.n, s.mat); }

bool seq4(float a,float b,float c,float d){ return (a<b)&&(b<c)&&(c<d); }
Span interSpan(Span a, Span b){
    if(!spanAny(a) || !spanAny(b)) return NO_SPAN();
    float an=a.n.t, af=a.f.t, bn=b.n.t, bf=b.f.t;
    if(af < bn || bf < an) return NO_SPAN();
    float tN = max(an,bn), tF = min(af,bf);
    if(tN > tF || tF < TOLERANCE) return NO_SPAN();
    Span outS = NO_SPAN();
    if(an > bn) { outS.mat = a.mat; outS.n = a.n; } else { outS.mat = b.mat; outS.n = b.n; }
    if(af < bf) outS.f = a.f; else outS.f = b.f;
    outS.n.t = tN; outS.f.t = tF;
    return outS;
}

void subSpan(Span a, Span b, out Span o0, out Span o1){
    o0 = NO_SPAN(); o1 = NO_SPAN();
    if(!spanAny(a)) return;
    if(!spanAny(b)){ o0 = a; return; }
    float an=a.n.t, af=a.f.t, bn=b.n.t, bf=b.f.t;
    if(af < bn || bf < an){ o0 = a; return; }
    if(seq4(an,bn,af,bf)){ Span s = NO_SPAN(); s.n = a.n; s.f = b.n; s.mat = a.mat; s.n.t = an; s.f.t = bn; o0 = s; return; }
    if(seq4(bn,an,bf,af)){ Span s = NO_SPAN(); s.n = b.f; s.f = a.f; s.mat = b.mat; s.n.t = bf; s.f.t = af; o0 = s; return; }
    if(seq4(an,bn,bf,af)){
        Span sA = NO_SPAN(); sA.n = a.n; sA.f = b.n; sA.mat = a.mat; sA.n.t = an; sA.f.t = bn;
        Span sB = NO_SPAN(); sB.n = b.f; sB.f = a.f; sB.mat = b.mat; sB.n.t = bf; sB.f.t = af;
        o0 = sA; o1 = sB; return;
    }
    if(seq4(bn,an,af,bf)) return;
    if(bn > an && bn < af){ Span sL = NO_SPAN(); sL.n = a.n; sL.f = b.n; sL.mat = a.mat; sL.n.t = an; sL.f.t = bn; o0 = sL; }
    if(bf > an && bf < af){ Span sR = NO_SPAN(); sR.n = b.f; sR.f = a.f; sR.mat = b.mat; sR.n.t = bf; sR.f.t = af; if(!spanAny(o0)) o0 = sR; else o1 = sR; }
}

struct Obj3 { Span s0; Span s1; Span s2; };
Obj3 ObjEmpty(){ Span z = NO_SPAN(); return Obj3(z,z,z); }
Obj3 ObjFromSpan(Span s){ Span z = NO_SPAN(); return Obj3(s,z,z); }
void addSpan(inout Obj3 o, Span s){
    if(!spanAny(s)) return;
    if(!spanAny(o.s0)){ o.s0 = s; return; }
    if(!spanAny(o.s1)){ o.s1 = s; return; }
    if(!spanAny(o.s2)){ o.s2 = s; return; }
    float t0 = o.s0.n.t, t1 = o.s1.n.t, t2 = o.s2.n.t;
    int imax = (t1 > t0) ? 1 : 0;
    float tmax = (imax==1) ? t1 : t0;
    if(t2 > tmax){ imax = 2; tmax = t2; }
    if(s.n.t < tmax){ if(imax==0) o.s0 = s; else if(imax==1) o.s1 = s; else o.s2 = s; }
}
RayOut rayFromObj(Obj3 o){ RayOut r = NO_RAY(); FastAdd(r, rayFromSpan(o.s0)); FastAdd(r, rayFromSpan(o.s1)); FastAdd(r, rayFromSpan(o.s2)); return r; }
Obj3 subObjSpan(Obj3 A, Span b){
    Obj3 R = ObjEmpty(); Span x0,x1;
    subSpan(A.s0, b, x0, x1); addSpan(R, x0); addSpan(R, x1);
    subSpan(A.s1, b, x0, x1); addSpan(R, x0); addSpan(R, x1);
    subSpan(A.s2, b, x0, x1); addSpan(R, x0); addSpan(R, x1);
    return R;
}
Obj3 interObjSpan(Obj3 A, Span b){
    Obj3 R = ObjEmpty();
    if(spanAny(A.s0)) addSpan(R, interSpan(A.s0, b));
    if(spanAny(A.s1)) addSpan(R, interSpan(A.s1, b));
    if(spanAny(A.s2)) addSpan(R, interSpan(A.s2, b));
    return R;
}

vec4 fetchA(int x, int y){ return texelFetch(iChannel0, ivec2(x,y), 0); }
vec4 getMaterial(float id){ return fetchA(int(id),4); }
vec3 erot(vec3 p, vec4 ax) { return mix(dot(p,ax.xyz)*ax.xyz,p,cos(ax.w))+sin(ax.w)*cross(ax.xyz,p); }
void getShape(int j, out vec3 p, out vec3 b, out int sh, out vec3 axis, out float rotSpeed, out float m){
    vec4 v0 = fetchA(j,0); vec4 v1 = fetchA(j,1); vec4 v2 = fetchA(j,2);
    p = v0.xyz; sh = int(floor(v0.w + 0.5)); b = v1.xyz; m = v1.w; axis = v2.xyz; rotSpeed = v2.w;
}
Span iBox( in vec3 ro, in vec3 rd, vec3 boxSize) {
    vec3 m = 1./rd; vec3 n = m*ro; vec3 k = abs(m)*boxSize;
    vec3 t1 = -n - k, t2 = -n + k;
    float tN = max( max( t1.x, t1.y ), t1.z );
    float tF = min( min( t2.x, t2.y ), t2.z );
    if( tN>tF || tF<0.) return NO_SPAN();
    vec3 oNor = -sign(rd)*step(t1.yzx,t1.xyz)*step(t1.zxy,t1.xyz);
    vec3 fNor = -sign(rd)*step(t2.xyz,t2.yzx)*step(t2.xyz,t2.zxy);
    return Span(Hit(tN,oNor) , Hit(tF,fNor),0.);
}

int trace(vec3 rd, vec3 ro, out RayOut r){
    r = NO_RAY(); int cnt=0;
    int NOPS = 34;
    Obj3 reg = ObjEmpty();
    for(int k = ZERO; k < NOPS; k++){
        vec4 opv = fetchA(k, 3);
        cnt++; int tp = int(opv.x), j = int(opv.y), add = int(opv.w);
        int end = (tp == 6) ? int(opv.w) : int(opv.z);
        if(tp == 6){
            int jumpTo = int(floor(opv.z + 0.5));
            vec3 p, b, axis; float ang, m; int sh; getShape(j, p, b, sh, axis, ang, m);
            if(iBox(ro-p, rd, b).n.t >= NOHIT && jumpTo > k) k = jumpTo - 1;
            if(end > 0) break; continue;
        }
        Span s = NO_SPAN();
        if(tp < 4){
            vec3 p, b, axis; float ang, m; int sh; getShape(j, p, b, sh, axis, ang, m);
            vec3 roR = ro - p, rdR = rd;
            if(ang != 0.0){ vec4 ax = vec4(axis, ang); roR = erot(roR, ax); rdR = erot(rdR, ax); }
            if(length(cross(roR, rdR)) <= length(b)){
                bool csg =(add==0 || (tp>=2 && tp<=3));
                if(sh==0) s = iBox(roR, rdR, b); else s = iSupportFunction(roR, rdR, b, sh, csg);
                s.mat = m;
                if(ang != 0.0){ vec4 invAx = vec4(axis, -ang); s.n.n = erot(s.n.n, invAx); s.f.n = erot(s.f.n, invAx); }
            }
        }
        if(tp == 0) reg = ObjFromSpan(s);
        else if(tp == 1) addSpan(reg, s);
        else if(tp == 2) reg = subObjSpan(reg, s);
        else if(tp == 3) reg = interObjSpan(reg, s);
        if(tp == 5 || add==1) FastAdd(r, rayFromObj(reg));
        if(end > 0) break;
    }
    return cnt;
}

mat3 setCamera( in vec3 ro, in vec3 ta, float cr ) {
	vec3 cw = normalize(ta-ro), cp = vec3(sin(cr), cos(cr),0.0);
	vec3 cu = normalize( cross(cw,cp) ), cv = ( cross(cu,cw) );
    return mat3( cu, cv, cw );
}

uint baseHash( uvec2 p ) {
    p = 1103515245U*((p >> 1U)^(p.yx));
    uint h32 = 1103515245U*((p.x)^(p.y>>3U));
    return h32^(h32 >> 16);
}

float hash1( inout float seed ) {
    uint n = baseHash(floatBitsToUint(vec2(seed+=.1,seed+=.1)));
    return float(n)/float(0xffffffffU);
}

vec2 hash2( inout float seed ) {
    uint n = baseHash(floatBitsToUint(vec2(seed+=.1,seed+=.1)));
    uvec2 rz = uvec2(n, n*48271U);
    return vec2(rz.xy & uvec2(0x7fffffffU))/float(0x7fffffff);
}

vec4 worldhit( in vec3 ro, in vec3 rd, in vec2 dist, out vec3 normal ) {
   RayOut h; vec4 d = vec4(dist, 0., float(trace(rd, ro, h)));
   if( h.d<d.y && h.d>d.x && h.d< NOHIT) { normal=h.n; d.xyz=vec3(d.y, h.d, h.id); }
   return d;
}

float checkerBoard( vec2 p ) { return mod(floor(p.x) + floor(p.y), 2.); }
vec3 getSkyColor( vec3 rd ) {
    vec3 col = mix(vec3(.7, .85, 1.0), vec3(.4, .6, .9), smoothstep(.15, -.15, rd.y));
    float sun = clamp(dot(normalize(vec3(-.4,.7,-.6)),rd), 0., 1.);
    col += vec3(1.0, 0.95, 0.8) * (pow(sun, 5.0) + 20.0 * pow(sun, 128.0));
    return col;
}

void getMaterialProperties(in vec3 pos, in float mat, out vec3 albedo, out float type, out float roughness) {
    vec4 m = getMaterial(mat); albedo=m.rgb; roughness = fract(m.a); type = floor(m.a);
    if( mat < 1.5 ) albedo*= mix(1.,.8,checkerBoard(pos.xz ));
}

float FresnelSchlickRoughness( float cosTheta, float F0, float roughness ) {
    return F0 + (max((1. - roughness), F0) - F0) * pow(abs(1. - cosTheta), 5.0);
}

vec3 cosWeightedRandomHemisphereDirection( const vec3 n, inout float seed ) {
  	vec2 r = hash2(seed);
	vec3  uu = normalize(cross(n, abs(n.y) > .5 ? vec3(1.,0.,0.) : vec3(0.,1.,0.))), vv = cross(uu, n);
	float ra = sqrt(r.y), rx = ra*cos(6.28318530718*r.x), ry = ra*sin(6.28318530718*r.x), rz = sqrt(1.-r.y);
    return normalize(vec3(rx*uu + ry*vv + rz*n));
}

vec3 modifyDirectionWithRoughness( const vec3 normal, const vec3 n, const float roughness, inout float seed ) {
    vec2 r = hash2(seed);
	vec3  uu = normalize(cross(n, abs(n.y) > .5 ? vec3(1.,0.,0.) : vec3(0.,1.,0.))), vv = cross(uu, n);
    float a = roughness*roughness;
	float rz = sqrt(abs((1.0-r.y) / clamp(1.+(a - 1.)*r.y,.00001,1.))), ra = sqrt(abs(1.-rz*rz));
	float rx = ra*cos(6.28318530718*r.x), ry = ra*sin(6.28318530718*r.x);
    vec3 ret = normalize(vec3(rx*uu + ry*vv + rz*n));
    return dot(ret,normal) > 0. ? ret : n;
}

#ifdef PATHTRACE
vec4 render( in vec3 ro, in vec3 rd, inout float seed ) {
    vec3 albedo, normal, col = vec3(1.); 
    float roughness, type, cnt=0.;
    for (int i=0; i<PATH_LENGTH; ++i) {    
    	vec4 res = worldhit( ro, rd, vec2(1e-4, 100.), normal );
        if(i==0) cnt=res.w;
		if (res.z > 0.) {
			ro += rd * res.y; getMaterialProperties(ro, res.z, albedo, type, roughness);
            if (type < LAMBERTIAN+.5) {
                float F = FresnelSchlickRoughness(max(0.,-dot(normal, rd)), .04, roughness);
                if (F > hash1(seed)) rd = modifyDirectionWithRoughness(normal, reflect(rd,normal), roughness, seed);
                else { col *= albedo; rd = cosWeightedRandomHemisphereDirection(normal, seed); }
            } else if (type < METAL+.5) { col *= albedo; rd = modifyDirectionWithRoughness(normal, reflect(rd,normal), roughness, seed); }
            else {
                vec3 normalOut, refracted; float ni_over_nt, cosine, reflectProb = 1.;
                if (dot(rd, normal) > 0.) { normalOut = -normal; ni_over_nt = 1.4; cosine = dot(rd, normal); cosine = sqrt(1.-(1.4*1.4)-(1.4*1.4)*cosine*cosine); }
                else { normalOut = normal; ni_over_nt = 1./1.4; cosine = -dot(rd, normal); }
	            refracted = refract(normalize(rd), normalOut, ni_over_nt);
                if(refracted != vec3(0)) { float r0 = (1.-ni_over_nt)/(1.+ni_over_nt); reflectProb = FresnelSchlickRoughness(cosine, r0*r0, roughness); }
                rd = hash1(seed) <= reflectProb ? reflect(rd,normal) : refracted;
                rd = modifyDirectionWithRoughness(-normalOut, rd, roughness, seed);            
            }
        } else { col *= getSkyColor(rd); return vec4(col,cnt); }
    }  
    return vec4(0,0,0,cnt);
}
#endif

void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    vec4 roState = fetchA(1,5);
    vec4 taState = fetchA(2,5);
    mat3 ca = setCamera(roState.xyz, taState.xyz, roState.w);    
    vec2 uv = (-iResolution.xy + 2.*fragCoord)/iResolution.y;
    float seed = float(baseHash(floatBitsToUint(uv + iTime)))/float(0xffffffffU);
    uv += (2.*hash2(seed)-1.0)/iResolution.y;
    vec3 rd = ca * normalize( vec3(uv, 1.4) );  
    vec4 col = render(roState.xyz, rd, seed);
    
    bool reset = texelFetch(iChannel0, ivec2(0,5), 0).x > .5;
    vec4 prev = texelFetch(iChannel1, ivec2(fragCoord), 0);
    
    float w = reset ? 1.0 : prev.w + 1.0;
    fragColor.rgb = mix(prev.rgb, col.rgb, 1.0 / w);
    fragColor.w = w;
}
`;

export const displayShader = `${header}
// ============================================================
// Post-Processing: Tone Mapping & Gamma Correction
// ============================================================
void main() {
    vec2 fc = gl_FragCoord.xy;
    vec3 col = texelFetch(iChannel1, ivec2(fc), 0).rgb;
    
    // Filmic Tone Mapping (Requested snippet)
    col = max(vec3(0.0), col - 0.004);
    col = (col * (6.2 * col + 0.5)) / (col * (6.2 * col + 1.7) + 0.06);
    
    fragColor = vec4(col, 1.0);
}
`;
