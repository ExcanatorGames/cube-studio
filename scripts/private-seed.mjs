import {readFile} from 'node:fs/promises';

// Optional local import. Public checkouts start with an empty history.
export async function readPrivateSeed(path=new URL('../data/seed.json',import.meta.url)){
  try{return JSON.parse(await readFile(path,'utf8'));}
  catch(error){if(error.code==='ENOENT')return [];throw error;}
}
