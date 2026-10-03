import crypto from 'node:crypto';
import admin from 'firebase-admin';
import {ApiError,sha,safeEqual,validateAnswer} from './security.js';
import {loadFirebaseServiceAccount} from './firebase-config.js';
import {competencyProgress} from './interview-logic.js';
export {ApiError,sha,safeEqual,validateAnswer};

export const COLLECTION = 'professionalAssessments_v1';
export const MAX_AI_CALLS = 115;
const ACCESS_MS = 7 * 24 * 60 * 60 * 1000;
const RETAIN_MS = 30 * 24 * 60 * 60 * 1000;

export function db() {
  if (!admin.apps.length) {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON && !process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
      throw new ApiError(503, 'Assessment database is not configured.');
    }
    const account = loadFirebaseServiceAccount();
    admin.initializeApp({ credential: admin.credential.cert(account) });
  }
  return admin.firestore();
}
export const sessionRef = id => {
  if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) throw new ApiError(400, 'Invalid session identifier.');
  return db().collection(COLLECTION).doc(id);
};
export function newSession() {
  const token = crypto.randomBytes(32).toString('hex');
  return { id: crypto.randomBytes(16).toString('hex'), token, tokenHash: sha(token), accessExpiresAt: new Date(Date.now() + ACCESS_MS), retainUntil: new Date(Date.now() + RETAIN_MS) };
}
export function previewAuthorized(code) {
  return Boolean(process.env.PREVIEW_ACCESS_CODE && safeEqual(code, process.env.PREVIEW_ACCESS_CODE));
}
export async function authorize(req) {
  const bearer = String(req.headers.authorization || '');
  const token = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
  const id = req.headers['x-session-id'];
  if (!/^[a-f0-9]{64}$/.test(token || '') || typeof id !== 'string') throw new ApiError(401,'Session not found. Please start a new interview.');
  const ref = sessionRef(id);
  const snap = await ref.get();
  if (!snap.exists || !safeEqual(snap.data().tokenHash,sha(token))) throw new ApiError(401, 'Session not found. Please start a new interview.');
  const session = snap.data();
  if (session.accessExpiresAt?.toMillis?.() < Date.now()) throw new ApiError(401,'This preview session has expired. Please start again.');
  return {ref,session};
}
export function output(res,status,payload) {
  res.setHeader('Cache-Control','no-store, private');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  return res.status(status).json(payload);
}
export function handleError(res,error,where) {
  if (!(error instanceof ApiError)) console.error(where,error?.message || 'Unexpected error');
  return output(res,error instanceof ApiError ? error.status : 500, { error:error instanceof ApiError ? error.message : 'Unexpected server error. Please retry.' });
}
export function postOnly(req,res) {
  if (req.method === 'POST') return true;
  res.setHeader('Allow','POST');output(res,405,{error:'POST required.'});return false;
}
export function parseBody(req,max=24000) {
  if (Number(req.headers['content-length']||0)>max) throw new ApiError(413,'Request too large.');
  const b = typeof req.body==='string' ? JSON.parse(req.body) : req.body;
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new ApiError(400,'Invalid request.');
  return b;
}
// Answer keys and rationales are server-only until the completed report.
export function publicQuestion(question){
 if(!question)return null;
 const {answerKey,rationale,...safe}=question;
 return safe;
}
export function publicProgress(session){
 const blueprint=session.blueprint||[];
 if(!blueprint.length)return {assessed:0,total:0};
 const {assessed,total}=competencyProgress(blueprint,session.history||[]);
 return {assessed,total};
}
export function safeState(session){
 return {status:session.status,profile:session.profile,answered:session.history?.length||0,
  history:(session.history||[]).map(({question,category,answer,competencyId,subskill,questionType})=>({question,category,answer,competencyId,subskill,questionType})),
  question:publicQuestion(session.currentQuestion),progress:publicProgress(session),
  accessExpiresAt:session.accessExpiresAt?.toDate?.()?.toISOString?.()||null};
}
