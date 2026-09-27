import {authBaseURL} from '../online/identity.mjs';
export default function handler(_req,res){res.setHeader('Cache-Control','no-store');res.json({authURL:authBaseURL()});}
