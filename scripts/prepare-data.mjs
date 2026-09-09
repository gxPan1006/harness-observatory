import {existsSync,mkdirSync,copyFileSync} from 'node:fs';
if(!existsSync('public/data/feed.json')){mkdirSync('public/data',{recursive:true});copyFileSync('data/bootstrap.json','public/data/feed.json');}
