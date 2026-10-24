// Read only Vercel's coarse geo headers; never return IP, coordinates or headers.
export function coarseLocation(headers) {
  const get=name=>headers?.get?.(name)??headers?.[name];
  const clean=(value,max)=>{
    if(typeof value!=='string')return '';
    try{value=decodeURIComponent(value);}catch{return '';}
    return value.normalize('NFC').replace(/[^\p{L}\p{M}\p{N} .,'’()-]/gu,'').trim().slice(0,max);
  };
  const country=String(get('x-vercel-ip-country')||'').toUpperCase();
  if(!/^[A-Z]{2}$/.test(country))return {};
  let region=clean(get('x-vercel-ip-country-region'),64);
  const argentina={A:'Salta',B:'Buenos Aires',C:'Ciudad de Buenos Aires',D:'San Luis',E:'Entre Ríos',F:'La Rioja',G:'Santiago del Estero',H:'Chaco',J:'San Juan',K:'Catamarca',L:'La Pampa',M:'Mendoza',N:'Misiones',P:'Formosa',Q:'Neuquén',R:'Río Negro',S:'Santa Fe',T:'Tucumán',U:'Chubut',V:'Tierra del Fuego',W:'Corrientes',X:'Córdoba',Y:'Jujuy',Z:'Santa Cruz'};
  if(country==='AR')region=argentina[region.replace(/^AR-/, '')]||region;
  return {geo_country:country,geo_region:region,geo_city:clean(get('x-vercel-ip-city'),80)};
}
export default function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.setHeader('Vercel-CDN-Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  if(req.method!=='GET'){res.statusCode=405;res.setHeader('Allow','GET');res.end('{}');return;}
  res.statusCode=200;res.end(JSON.stringify(coarseLocation(req.headers)));
}
