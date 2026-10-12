import fs from 'fs'; const r=JSON.parse(fs.readFileSync(process.argv[2]));
const f=r.files.filter(l=>l.includes('g1-file')).map(l=>l.replace(/.*path=/,'').replace(/ status.*/,''));
const u=[];for(const x of f)if(!x.toLowerCase().includes('.pak.')&&u[u.length-1]!==x)u.push(x);console.log(u.join('\n'));
