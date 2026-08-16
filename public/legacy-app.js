/* ============================= FIREBASE ============================= */
const firebaseConfig = {
  apiKey: "AIzaSyBHvV4GTdsjbdc09gJOx-exuT5IaNOf92w",
  authDomain: "picklehub-10acc.firebaseapp.com",
  projectId: "picklehub-10acc",
  storageBucket: "picklehub-10acc.firebasestorage.app",
  messagingSenderId: "677766385806",
  appId: "1:677766385806:web:aa085bb295937b79e279df"
};
firebase.initializeApp(firebaseConfig);
const ACTIVE_CLUB_ID = 'rising-club';
// Add the reCAPTCHA Enterprise site key after registering this web app in Firebase App Check.
// Leave blank until App Check metrics have been monitored and the production domain is registered.
const APP_CHECK_ENTERPRISE_SITE_KEY = '';
if(APP_CHECK_ENTERPRISE_SITE_KEY && firebase.appCheck){
  const appCheck=firebase.appCheck();
  appCheck.activate(new firebase.appCheck.ReCaptchaEnterpriseProvider(APP_CHECK_ENTERPRISE_SITE_KEY),true);
}
const db = firebase.firestore();
const OFFLINE_PREF_KEY='picklehub_offline_access';
const offlineAccessRequested=typeof localStorage!=='undefined'&&localStorage.getItem(OFFLINE_PREF_KEY)==='enabled';
let offlinePersistenceActive=false;
let offlinePersistenceReady=Promise.resolve();
if(offlineAccessRequested&&typeof db.enablePersistence==='function'){
  offlinePersistenceReady=db.enablePersistence({synchronizeTabs:true}).then(()=>{ offlinePersistenceActive=true; }).catch(err=>{
    console.warn('Offline persistence unavailable',err);
  });
}
const auth = firebase.auth();
const PLAYERS_COL = db.collection('players');
const MATCHES_COL = db.collection('matches');
const SCHEDULES_COL = db.collection('schedules'); // Phase 3: new plans use unique document IDs; legacy date-keyed docs remain supported
const USERS_COL = db.collection('users');
const CLUBS_COL = db.collection('clubs');
const CLUB_MEMBERSHIPS_COL = db.collection('clubMemberships');
const CLUB_ADMINS_COL = db.collection('clubAdmins');
const CLUB_CHATS_COL = db.collection('clubChats');
const SUPPORT_REQUESTS_COL = db.collection('supportRequests');
const PROFILE_VIEWS_COL = db.collection('profileViews');
const NOTIFICATIONS_COL = db.collection('notifications');
const LEGACY_CLUB = {id:ACTIVE_CLUB_ID,name:'Rising Club',origin:'Origin address pending migration',legacy:true};
const THEME_PREF_KEY='picklehub_theme';
const CHAT_READ_PREF_KEY='courtrush_chat_mention_reads_v1';
const NOTIFICATION_SEEN_PREF_KEY='courtrush_seen_notifications_v1';

/* ============================= STATE ============================= */
let state = {
  loading: true,
  connected: true,
  online: typeof navigator==='undefined' ? true : navigator.onLine,
  tab: 'dashboard',
  navOpen: false,
  profileNameEditing: false,
  profileNameBusy: false,
  dateRange: 'overall',  // 'overall' | 'year' | 'month' | 'week' | 'custom'
  customDateStart: '',
  customDateEnd: '',
  rosterSortKey: 'clubs', // 'clubs' | 'games' | 'record' | 'mvp'
  rosterSortDirection: 'asc', // 'asc' | 'desc'
  rosterClubFilterIds: null, // null = all clubs; array = selected club ids, including '__none__'
  rosterClubFilterOpen: false,
  rosterClubFilterSearch: '',
  rosterSearchQuery: '',
  rosterPage: 1,
  profileSettingsOpen: false,
  profileDivisionBusy: false,
  divisionTipIndex: 0,
  players: [],
  users: [],
  matches: [],
  schedules: [],          // normalized Firestore documents; each item includes docId
  clubs: [],
  clubMemberships: [],
  clubRoles: [],
  profileViews: [],
  adminClubIds: [],
  staffClubIds: [],
  clubHubSelectedId: null,
  clubDetailSource: null,
  clubProfileRoleFilter: 'all',
  playerModalContext: null,
  clubWorkspaceView: 'hub', // 'hub' | 'chat' | 'members'
  showClubRegistration: false,
  clubBusy: false,
  profileClubBusy: false,
  scheduleScreen: 'list', // 'list' | 'create' | 'edit' | 'view'
  scheduleFilter: 'today',// 'today' | 'upcoming' | 'dates' | 'mine'
  scheduleCourtFilter: 'all', // landing-page court-count filter
  activeCourtFilter: 'all',   // court number shown inside one Game Plan
  activeScheduleId: null,
  historyGroupKey: null,
  editingResultId: null,   // saved match currently being corrected inline
  lateResultKey: null,     // ended-plan slot currently receiving a delayed result
  scheduleDraft: null,
  tournamentTeams: null,  // [[p1,p2], ...] staged fixed teams
  tournamentLeftover: null,
  playerModalId: null,
  showAddPlayer: false,
  scheduleSelection: new Set(),
  scheduleGuestSearch: '',
  scheduleGuestSearchOpen: false,
  scheduleLeaderboardOpenId: null,
  h2hA: null,
  h2hB: null,
  playerProfilePlanKey: null,
  h2hClubId: 'all',
  h2hSearchA: '',
  h2hSearchB: '',
  currentUser: null,      // { uid, email, role:'admin'|'player', playerId }
  myPlayerId: null,       // shortcut to currentUser.playerId, kept for convenience
  showAuthModal: false,
  authMode: 'login',      // 'login' | 'register'
  authBusy: false,
  profileVisibilityBusy: false,
  profilePasswordBusy: false,
  clubInviteBusyId: null,
  chatClubId: null,
  chatMessages: [],
  directChatMessages: [],
  chatBusy: false,
  chatClearBusy: false,
  chatMentionIndex: 0,
  supportPanelOpen: false,
  supportBusy: false,
  supportRequests: [],
};

const MODE_META = {
  open:       { label:'Open Play',    short:'Open Play',   desc:'Partners and opponents rotate every round so everyone mixes.' },
  tournament: { label:'Tournament',   short:'Tournament',  desc:'Teams are locked in for the whole event and face every other team once.' },
  dupr:       { label:'DUPR Match',   short:'DUPR',        desc:'Log an official rated result directly - no rotation, just the two teams that played.' },
};
const DATE_RANGE_META = {
  overall: { label:'Overall' },
  year:    { label:'This Year' },
  month:   { label:'This Month' },
  week:    { label:'This Week' },
};
const MVP_RULE_TEXT = 'Best W/L means the most wins, then the fewest losses. The same player must also have the highest total +/-.';

function isSuperAdmin(){ return !!(state.currentUser&&state.currentUser.role==='admin'); }
function isClubAdmin(clubId){
  if(!state.currentUser||!clubId) return false;
  return state.adminClubIds.includes(clubId) ||
    (state.currentUser.role==='club_admin'&&(state.currentUser.clubId||ACTIVE_CLUB_ID)===clubId);
}
function isClubStaff(clubId){ return !!(state.currentUser&&clubId&&state.staffClubIds.includes(clubId)); }
function isAnyClubAdmin(){ return !!(state.currentUser&&(state.adminClubIds.length||state.currentUser.role==='club_admin')); }
function isAdmin(){ return isSuperAdmin()||isAnyClubAdmin(); }
function isAdminForClub(clubId){ return isSuperAdmin()||isClubAdmin(clubId||ACTIVE_CLUB_ID); }
function canClearClubChat(clubId){ return !!(clubId&&(isSuperAdmin()||isClubAdmin(clubId)||isClubStaff(clubId))); }
function isSignedIn(){ return !!state.currentUser; }

function clubMembershipId(clubId,playerId){ return `${clubId}_${playerId}`; }
function clubAdminId(clubId,uidValue){ return `${clubId}_${uidValue}`; }
function normalizedClubRecords(){
  const unique=new Map();
  [...state.clubs].forEach(c=>{
    const id=c.id||c.docId;
    if(id) unique.set(id,{...unique.get(id),...c,id});
  });
  return [...unique.values()];
}
function clubsForDisplay(){
  const records=normalizedClubRecords();
  const clubs=records.filter(c=>c.status!=='removed');
  if(!records.some(c=>c.id===ACTIVE_CLUB_ID)) clubs.unshift({...LEGACY_CLUB});
  return clubs.sort((a,b)=>(a.name||'').localeCompare(b.name||'',undefined,{sensitivity:'base'}));
}
function clubRecordById(clubId){
  const record=normalizedClubRecords().find(c=>c.id===clubId);
  if(record) return record;
  return clubId===ACTIVE_CLUB_ID?{...LEGACY_CLUB}:null;
}
function clubById(clubId){
  const club=clubRecordById(clubId);
  return club&&club.status!=='removed'?club:null;
}
function clubName(clubId){ const club=clubRecordById(clubId); return club?club.name:'Independent'; }
function playerClubIds(player){
  if(!player) return [];
  const ids=new Set(Array.isArray(player.clubIds)?player.clubIds.filter(Boolean):[]);
  if(player.clubId) ids.add(player.clubId);
  state.clubMemberships.filter(m=>m.playerId===player.id).forEach(m=>{
    if(m.status==='active') ids.add(m.clubId);
    else ids.delete(m.clubId);
  });
  return [...ids];
}
function clubMembershipRecord(clubId,playerId){
  return state.clubMemberships.find(m=>m.clubId===clubId&&m.playerId===playerId)||null;
}
function pendingJoinRequest(clubId,playerId){
  const record=clubMembershipRecord(clubId,playerId);
  return record&&record.status==='pending'?record:null;
}
function pendingClubInvite(clubId,playerId){
  const record=clubMembershipRecord(clubId,playerId);
  return record&&record.status==='invited'?record:null;
}
function pendingJoinRequestsForClub(clubId){
  return state.clubMemberships.filter(m=>m.clubId===clubId&&m.status==='pending');
}
function pendingManagedJoinRequestCount(){
  const managed=new Set(managedClubIds());
  return state.clubMemberships.filter(m=>m.status==='pending'&&managed.has(m.clubId)&&!!clubById(m.clubId)).length;
}
function activePlayerClubIds(player){ return playerClubIds(player).filter(id=>!!clubById(id)); }
function playerIsMemberOfClub(player,clubId){ return !!(player&&clubId&&clubById(clubId)&&playerClubIds(player).includes(clubId)); }
function membersForClub(clubId){ return state.players.filter(p=>playerIsMemberOfClub(p,clubId)).sort((a,b)=>a.name.localeCompare(b.name)); }
function myClubIds(){
  const player=state.players.find(p=>p.id===state.myPlayerId);
  return activePlayerClubIds(player);
}
function managedClubIds(){
  if(isSuperAdmin()) return clubsForDisplay().map(c=>c.id);
  const ids=new Set(state.adminClubIds);
  if(state.currentUser&&state.currentUser.role==='club_admin') ids.add(state.currentUser.clubId||ACTIVE_CLUB_ID);
  return [...ids];
}
function canInvitePlayersToClub(clubId){
  return !!(state.currentUser&&clubId&&clubById(clubId)&&(isAdminForClub(clubId)||myClubIds().includes(clubId)));
}
function inviteClubIds(){
  if(isSuperAdmin()) return clubsForDisplay().map(c=>c.id);
  return [...new Set([...myClubIds(),...managedClubIds()])].filter(id=>!!clubById(id));
}
function managedInviteClubsForPlayer(player){
  if(!player) return [];
  return inviteClubIds().map(clubById).filter(club=>club&&!playerIsMemberOfClub(player,club.id));
}
function chatClubIds(){
  return [...new Set([...myClubIds(),...managedClubIds(),...state.staffClubIds])].filter(id=>!!clubById(id));
}
function chatReadState(){
  try{ return JSON.parse(localStorage.getItem(CHAT_READ_PREF_KEY)||'{}')||{}; }
  catch(_){ return {}; }
}
function chatReadKey(clubId){ return `${state.currentUser?state.currentUser.uid:'guest'}:${clubId}`; }
function chatMessageTime(message){
  const value=message&&message.createdAt;
  const date=value&&typeof value.toDate==='function'?value.toDate():new Date(value||0);
  return Number.isNaN(date.getTime())?0:date.getTime();
}
function messageMentionsMe(message){
  return !!(state.myPlayerId&&message&&message.senderUid!==(state.currentUser&&state.currentUser.uid)&&Array.isArray(message.mentions)&&message.mentions.includes(state.myPlayerId));
}
function unreadMentionCount(clubId){
  const lastRead=Number(chatReadState()[chatReadKey(clubId)]||0);
  return allChatMessages().filter(message=>message.clubId===clubId&&canViewChatMessage(message)&&messageMentionsMe(message)&&chatMessageTime(message)>lastRead).length;
}
function allChatMessages(){
  const byId=new Map();
  [...state.chatMessages,...state.directChatMessages].forEach(message=>{ if(message&&message.id) byId.set(message.id,message); });
  return [...byId.values()].sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
}
function canViewChatMessage(message){
  if(!message) return false;
  if(message.kind!=='system') return true;
  if(message.systemType!=='schedule_created'&&message.systemType!=='schedule_updated') return true;
  const mentions=Array.isArray(message.mentions)?message.mentions:[];
  return !!(state.myPlayerId&&mentions.includes(state.myPlayerId)&&playerIsMemberOfClub(state.players.find(p=>p.id===state.myPlayerId),message.clubId))||canClearClubChat(message.clubId);
}
function lockedScheduleChatNotice(clubId){
  if(!clubId||!state.myPlayerId||playerIsMemberOfClub(state.players.find(p=>p.id===state.myPlayerId),clubId)||canClearClubChat(clubId)) return null;
  return allChatMessages().find(message=>
    message&&message.clubId===clubId&&message.kind==='system'&&
    (message.systemType==='schedule_created'||message.systemType==='schedule_updated')&&
    Array.isArray(message.mentions)&&message.mentions.includes(state.myPlayerId)
  )||null;
}
function visibleChatClubIds(){
  return [...new Set([...chatClubIds(),...state.directChatMessages.filter(message=>messageMentionsMe(message)).map(message=>message.clubId)])].filter(id=>!!clubById(id));
}
function totalUnreadMentions(){ return visibleChatClubIds().reduce((total,clubId)=>total+unreadMentionCount(clubId),0); }
function markChatRead(clubId){
  if(!clubId||!state.currentUser||!unreadMentionCount(clubId)) return;
  const reads=chatReadState();
  reads[chatReadKey(clubId)]=Date.now();
  try{ localStorage.setItem(CHAT_READ_PREF_KEY,JSON.stringify(reads)); }catch(_){}
}
function clubRoleRecord(clubId,playerId){
  return state.clubRoles.find(role=>role.clubId===clubId&&role.playerId===playerId)||null;
}
function clubRoleForPlayer(clubId,player){
  if(!player) return 'member';
  const role=clubRoleRecord(clubId,player.id);
  return role&&['club_admin','co_admin','staff'].includes(role.role)?role.role:'member';
}
function clubRoleLabel(role){
  return role==='club_admin'?'Club Admin':role==='co_admin'?'Co-Admin':role==='staff'?'Staff':'Member';
}
function clubRoleSortRank(role){
  return role==='club_admin'?0:role==='co_admin'?1:role==='staff'?2:3;
}
function sortClubMembersByRole(clubId,members){
  return [...(members||[])].sort((a,b)=>{
    const roleDiff=clubRoleSortRank(clubRoleForPlayer(clubId,a))-clubRoleSortRank(clubRoleForPlayer(clubId,b));
    return roleDiff || a.name.localeCompare(b.name,undefined,{sensitivity:'base'});
  });
}
function canAssignClubRoles(clubId){
  if(isSuperAdmin()) return true;
  if(!state.currentUser) return false;
  const mine=state.clubRoles.find(role=>role.clubId===clubId&&role.uid===state.currentUser.uid);
  return !!(mine&&mine.role==='club_admin') || (state.currentUser.role==='club_admin'&&(state.currentUser.clubId||ACTIVE_CLUB_ID)===clubId);
}
function canTransferPrimaryClubAdmin(clubId){
  return !!(clubId&&state.currentUser&&(isSuperAdmin()||isClubAdmin(clubId)));
}
function themeValue(){ return document.documentElement.dataset.theme==='dark'?'dark':'light'; }
function iconSVG(name){
  const icons={
    sun:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>',
    moon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 7 7 0 1 0 20.5 14.5Z"></path></svg>',
    menu:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M4 12h16"></path><path d="M4 17h16"></path></svg>'
  };
  return icons[name]||'';
}
function toggleTheme(){
  const next=themeValue()==='dark'?'light':'dark';
  document.documentElement.dataset.theme=next;
  document.documentElement.style.colorScheme=next;
  try{ localStorage.setItem(THEME_PREF_KEY,next); }catch(_){}
  render();
}

/* Schedule reads are scoped to the active landing filter. Today/Upcoming share
   one future-plans query; My Created uses an owner query. Leaving Schedule
   unsubscribes so the app does not keep downloading schedule changes needlessly. */
let scheduleUnsub=null;
let scheduleSyncKey=null;
function stopScheduleSync(){
  if(scheduleUnsub){ scheduleUnsub(); scheduleUnsub=null; }
  scheduleSyncKey=null;
}
function refreshScheduleSync(force){
  if(state.tab!=='schedule'){ stopScheduleSync(); return; }
  if(!state.currentUser){
    stopScheduleSync();
    state.schedules=[];
    return;
  }
  if(typeof SCHEDULES_COL.where!=='function') return;
  const mine=state.scheduleFilter==='mine';
  const dates=state.scheduleFilter==='dates';
  const bounds=dateRangeBounds(state.dateRange);
  const key=mine?`mine:${state.currentUser.uid}`:dates?`dates:${bounds.start||''}:${bounds.end||''}`:`future:${state.currentUser?state.currentUser.uid:'guest'}:${todayStr()}`;
  if(!force&&scheduleUnsub&&scheduleSyncKey===key) return;
  stopScheduleSync();
  scheduleSyncKey=key;
  const source=mine
    ? SCHEDULES_COL.where('createdBy','==',state.currentUser.uid)
    : dates
      ? (bounds.start?SCHEDULES_COL.where('date','>=',bounds.start):SCHEDULES_COL.where('date','<=',bounds.end||todayStr()))
      : SCHEDULES_COL.where('date','>=',todayStr());
  scheduleUnsub=source.onSnapshot(snap=>{
    state.schedules=snap.docs.map(d=>normalizeScheduleDoc(d.id,d.data()));
    state.connected=true;
    render();
  },err=>{
    console.error(err);
    stopScheduleSync();
    state.schedules=[];
    state.connected=false;
    toast('Could not load Game Plans - check your connection or Firestore rules');
    render();
  });
}

let clubAdminUnsub=null;
let clubRoleUnsubs=[];
let clubRoleSyncKey='';
function stopClubRoleDirectorySync(){ clubRoleUnsubs.forEach(unsub=>unsub()); clubRoleUnsubs=[]; clubRoleSyncKey=''; state.clubRoles=[]; }
function refreshClubRoleDirectorySync(force){
  if(!state.currentUser){ stopClubRoleDirectorySync(); return; }
  const clubIds=[...new Set([...myClubIds(),...managedClubIds()])].filter(Boolean).sort();
  const key=clubIds.join('|');
  if(!force&&clubRoleUnsubs.length&&clubRoleSyncKey===key) return;
  stopClubRoleDirectorySync();
  clubRoleSyncKey=key;
  const byClub=new Map();
  clubIds.forEach(clubId=>{
    const unsub=CLUB_ADMINS_COL.where('clubId','==',clubId).onSnapshot(snap=>{
      byClub.set(clubId,snap.docs.map(doc=>({id:doc.id,...doc.data()})));
      state.clubRoles=[...byClub.values()].flat();
      render();
    },err=>console.error(`Club role sync failed for ${clubId}`,err));
    clubRoleUnsubs.push(unsub);
  });
}
function refreshClubAdminSync(){
  if(clubAdminUnsub){ clubAdminUnsub(); clubAdminUnsub=null; }
  state.adminClubIds=[];
  state.staffClubIds=[];
  if(!state.currentUser||typeof CLUB_ADMINS_COL.where!=='function') return;
  clubAdminUnsub=CLUB_ADMINS_COL.where('uid','==',state.currentUser.uid).onSnapshot(snap=>{
    const roles=snap.docs.map(d=>d.data());
    state.adminClubIds=[...new Set(roles.filter(role=>!role.role||role.role==='club_admin'||role.role==='co_admin').map(role=>role.clubId).filter(Boolean))];
    state.staffClubIds=[...new Set(roles.filter(role=>role.role==='staff').map(role=>role.clubId).filter(Boolean))];
    refreshClubRoleDirectorySync(true);
    refreshChatSync(true);
    render();
  },err=>console.error('Club admin sync failed',err));
}

let chatUnsubs=[];
let chatSyncKey='';
function stopChatSync(){ chatUnsubs.forEach(unsub=>unsub()); chatUnsubs=[]; chatSyncKey=''; state.chatMessages=[]; }
function refreshChatSync(force){
  if(!state.currentUser||!state.myPlayerId){ stopChatSync(); return; }
  const clubIds=chatClubIds().sort();
  const key=clubIds.join('|');
  if(!force&&chatUnsubs.length&&chatSyncKey===key) return;
  stopChatSync();
  chatSyncKey=key;
  if(!clubIds.length){ state.chatClubId=null; render(); return; }
  if(!clubIds.includes(state.chatClubId)) state.chatClubId=clubIds[0];
  const byClub=new Map();
  clubIds.forEach(clubId=>{
    const unsub=CLUB_CHATS_COL.where('clubId','==',clubId).onSnapshot(snap=>{
      byClub.set(clubId,snap.docs.map(doc=>({id:doc.id,...doc.data()})));
      state.chatMessages=[...byClub.values()].flat().sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||''))).slice(-500);
      if(state.tab==='chat'&&state.chatClubId===clubId) markChatRead(clubId);
      render();
    },err=>{ console.error('Club chat sync failed',err); toast(`Could not load ${clubName(clubId)} chat`); });
    chatUnsubs.push(unsub);
  });
}

let directChatNoticeUnsub=null;
let directChatNoticeKey='';
function stopDirectChatNoticeSync(){
  if(directChatNoticeUnsub){ directChatNoticeUnsub(); directChatNoticeUnsub=null; }
  directChatNoticeKey='';
  state.directChatMessages=[];
}
function refreshDirectChatNoticeSync(){
  if(!state.currentUser||!state.myPlayerId||typeof CLUB_CHATS_COL.where!=='function'){ stopDirectChatNoticeSync(); return; }
  const key=`mentions:${state.myPlayerId}`;
  if(directChatNoticeUnsub&&directChatNoticeKey===key) return;
  stopDirectChatNoticeSync();
  directChatNoticeKey=key;
  directChatNoticeUnsub=CLUB_CHATS_COL.where('mentions','array-contains',state.myPlayerId).onSnapshot(snap=>{
    state.directChatMessages=snap.docs.map(doc=>({id:doc.id,...doc.data()})).filter(message=>message.kind==='system').slice(-100);
    render();
  },err=>console.error('Direct club notice sync failed',err));
}

let supportUnsub=null;
let supportSyncKey='';
function stopSupportSync(){
  if(supportUnsub){ supportUnsub(); supportUnsub=null; }
  supportSyncKey=''; state.supportRequests=[];
}
function refreshSupportSync(force){
  if(!state.currentUser){ stopSupportSync(); return; }
  const key=isSuperAdmin()?'admin:all':`user:${state.currentUser.uid}`;
  if(!force&&supportUnsub&&supportSyncKey===key) return;
  stopSupportSync(); supportSyncKey=key;
  const source=isSuperAdmin()?SUPPORT_REQUESTS_COL:SUPPORT_REQUESTS_COL.where('reporterUid','==',state.currentUser.uid);
  supportUnsub=source.onSnapshot(snap=>{
    state.supportRequests=snap.docs.map(doc=>({id:doc.id,...doc.data()})).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,100);
    render();
  },err=>{ console.error('Support inbox sync failed',err); });
}

let notificationUnsub=null;
let notificationSyncKey='';
function seenNotificationIds(){
  try{ return JSON.parse(localStorage.getItem(NOTIFICATION_SEEN_PREF_KEY)||'[]')||[]; }
  catch(_){ return []; }
}
function rememberNotificationIds(ids){
  try{ localStorage.setItem(NOTIFICATION_SEEN_PREF_KEY,JSON.stringify([...new Set(ids)].slice(-300))); }
  catch(_){}
}
async function showBrowserNotification(record){
  if(typeof Notification==='undefined'||Notification.permission!=='granted') return;
  if(!('serviceWorker' in navigator)) return;
  try{
    const registration=await navigator.serviceWorker.ready;
    await registration.showNotification(record.title||'CourtRush',{
      body:record.body||'You have a new CourtRush update.',
      icon:'./courtrush-icon.svg',
      badge:'./courtrush-icon.svg',
      data:{url:record.url||'./index.html'}
    });
  }catch(e){ console.warn('Browser notification failed',e); }
}
function stopNotificationSync(){
  if(notificationUnsub){ notificationUnsub(); notificationUnsub=null; }
  notificationSyncKey='';
}
function refreshNotificationSync(force){
  if(!state.currentUser||!state.myPlayerId||typeof NOTIFICATIONS_COL.where!=='function'){ stopNotificationSync(); return; }
  const key=`player:${state.myPlayerId}`;
  if(!force&&notificationUnsub&&notificationSyncKey===key) return;
  stopNotificationSync();
  notificationSyncKey=key;
  notificationUnsub=NOTIFICATIONS_COL.where('recipientPlayerId','==',state.myPlayerId).onSnapshot(snap=>{
    const seen=new Set(seenNotificationIds());
    const nextSeen=[...seen];
    snap.docs.map(doc=>({id:doc.id,...doc.data()})).forEach(record=>{
      if(seen.has(record.id)) return;
      nextSeen.push(record.id);
      if(record.createdByUid!==state.currentUser.uid) showBrowserNotification(record);
    });
    rememberNotificationIds(nextSeen);
  },err=>console.error('Notification sync failed',err));
}

/* ============================= AUTH ============================= */
let userDocUnsub = null;
offlinePersistenceReady.then(()=>auth.onAuthStateChanged(user=>{
  if(userDocUnsub){ userDocUnsub(); userDocUnsub=null; }
  if(!user){
    state.currentUser = null;
    state.myPlayerId = null;
    refreshClubAdminSync();
    refreshClubRoleDirectorySync(true);
    refreshScheduleSync(true);
    refreshChatSync(true);
    refreshDirectChatNoticeSync();
    refreshSupportSync(true);
    refreshNotificationSync(true);
    render();
    return;
  }
  state.currentUser = { uid:user.uid, email:user.email, displayName:user.displayName||'', photoURL:user.photoURL||'', role:'player', clubId:null, clubIds:[], playerId:null };
  refreshClubAdminSync();
  refreshScheduleSync(true);
  refreshChatSync(true);
  refreshDirectChatNoticeSync();
  refreshSupportSync(true);
  refreshNotificationSync(true);
  render();
  userDocUnsub = USERS_COL.doc(user.uid).onSnapshot(doc=>{
    if(doc.exists){
      const d = doc.data();
      state.currentUser = { uid:user.uid, email:user.email, displayName:d.displayName||user.displayName||'', photoURL:d.photoURL||user.photoURL||'', role: d.role||'player', clubId:d.clubId||null, clubIds:Array.isArray(d.clubIds)?d.clubIds:[], playerId: d.playerId||null };
      state.myPlayerId = d.playerId || null;
      refreshClubAdminSync();
      refreshClubRoleDirectorySync(true);
      refreshChatSync(true);
      refreshDirectChatNoticeSync();
      refreshSupportSync(true);
      refreshNotificationSync(true);
    }
    render();
  }, err=> console.error(err));
}));

/* ============================= REALTIME SYNC ============================= */
function startSync(){
  PLAYERS_COL.onSnapshot(snap=>{
    state.players = snap.docs.map(d=>d.data());
    state.connected = true;
    refreshChatSync();
    refreshClubRoleDirectorySync();
    render();
  }, err=>{ console.error(err); state.connected=false; toast('Sync error - check your connection'); render(); });

  USERS_COL.onSnapshot(snap=>{
    state.users=snap.docs.map(d=>({uid:d.id,...d.data()}));
    render();
  }, err=>{ console.warn('User directory sync unavailable',err); state.users=[]; render(); });

  MATCHES_COL.onSnapshot(snap=>{
    state.matches = snap.docs.map(d=>d.data());
    render();
  }, err=>{ console.error(err); });

  CLUBS_COL.onSnapshot(snap=>{
    state.clubs=snap.docs.map(d=>({id:d.id,docId:d.id,...d.data()}));
    render();
  },err=>console.error('Club sync failed',err));

  CLUB_MEMBERSHIPS_COL.onSnapshot(snap=>{
    state.clubMemberships=snap.docs.map(d=>({id:d.id,...d.data()}));
    refreshChatSync(true);
    refreshClubRoleDirectorySync(true);
    render();
  },err=>console.error('Club membership sync failed',err));

  PROFILE_VIEWS_COL.where('day','==',todayStr()).onSnapshot(snap=>{
    state.profileViews=snap.docs.map(d=>({id:d.id,...d.data()}));
    render();
  },err=>console.error('Profile visitor sync failed',err));

}

/* ============================= SCHEDULE MATH ============================= */
// So every player partners with (and faces) every other player exactly once,
// classic round-robin "circle method" needs N-1 rounds for even N, N rounds for odd N (one bye/sit-out each round).
function autoRoundCount(n){
  if(n < 2) return 0;
  return (n % 2 === 0) ? (n - 1) : n;
}


/* ============================= HELPERS ============================= */
function uid(p){ return p+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function localDateStr(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function todayStr(){ return localDateStr(new Date()); }
function fmtDate(s){ const d=new Date(s+'T00:00:00'); return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
function dateRangeBounds(range){
  const key=range==='custom'?'custom':(DATE_RANGE_META[range]?range:'overall');
  if(key==='custom'){
    const start=/^\d{4}-\d{2}-\d{2}$/.test(state.customDateStart||'')?state.customDateStart:null;
    const end=/^\d{4}-\d{2}-\d{2}$/.test(state.customDateEnd||'')?state.customDateEnd:null;
    return {start,end};
  }
  if(key==='overall') return {start:null,end:null};
  const now=new Date();
  let start,end;
  if(key==='year'){
    start=new Date(now.getFullYear(),0,1);
    end=new Date(now.getFullYear(),11,31);
  }else if(key==='month'){
    start=new Date(now.getFullYear(),now.getMonth(),1);
    end=new Date(now.getFullYear(),now.getMonth()+1,0);
  }else{
    const mondayOffset=(now.getDay()+6)%7;
    start=new Date(now.getFullYear(),now.getMonth(),now.getDate()-mondayOffset);
    end=new Date(start.getFullYear(),start.getMonth(),start.getDate()+6);
  }
  return {start:localDateStr(start),end:localDateStr(end)};
}
function dateInActiveRange(dateStr){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr||''))) return false;
  const {start,end}=dateRangeBounds(state.dateRange);
  if(!start&&!end) return true;
  return (!start||dateStr>=start)&&(!end||dateStr<=end);
}
function activeDateRangeLabel(){
  if(state.dateRange==='custom'){
    const {start,end}=dateRangeBounds('custom');
    if(start&&end&&start===end) return fmtDate(start);
    return 'Selected Dates';
  }
  return (DATE_RANGE_META[state.dateRange]||DATE_RANGE_META.overall).label;
}
function activeDateRangeSummary(){
  const {start,end}=dateRangeBounds(state.dateRange);
  if(!start&&!end) return 'All dates';
  if(start&&!end) return `From ${fmtDate(start)}`;
  if(!start&&end) return `Through ${fmtDate(end)}`;
  if(start===end) return fmtDate(start);
  return `${fmtDate(start)} - ${fmtDate(end)}`;
}
function resetDateFilteredViews(){
  state.historyGroupKey=null;
  if(state.tab==='schedule'&&state.scheduleScreen==='view'){
    state.scheduleScreen='list';
    state.activeScheduleId=null;
    state.activeCourtFilter='all';
    state.editingResultId=null;
    state.lateResultKey=null;
  }
}
function setDateRange(range){
  state.dateRange=DATE_RANGE_META[range]?range:'overall';
  state.customDateStart='';
  state.customDateEnd='';
  resetDateFilteredViews();
  render();
}
function applyCustomDateRange(ev){
  if(ev) ev.preventDefault();
  const startEl=document.getElementById('customDateStart');
  const endEl=document.getElementById('customDateEnd');
  const start=startEl?startEl.value:'';
  const end=endEl?endEl.value:'';
  if(!start&&!end){ toast('Choose a start date, an end date, or both'); return; }
  if(start&&end&&start>end){ toast('The start date must be on or before the end date'); return; }
  state.customDateStart=start;
  state.customDateEnd=end;
  state.dateRange='custom';
  resetDateFilteredViews();
  if(state.tab==='schedule'){
    state.scheduleFilter='dates';
    state.scheduleCourtFilter='all';
    refreshScheduleSync(true);
  }
  render();
}
function clearCustomDateRange(){
  state.customDateStart='';
  state.customDateEnd='';
  state.dateRange='overall';
  resetDateFilteredViews();
  if(state.tab==='schedule'&&state.scheduleFilter==='dates'){
    state.scheduleFilter='today';
    state.scheduleCourtFilter='all';
    refreshScheduleSync(true);
  }
  render();
}
function matchVerificationStatus(match){
  const value=match&&match.verificationStatus;
  return value==='pending'||value==='disputed'||value==='confirmed'?value:'confirmed';
}
function isOfficialMatch(match){ return matchVerificationStatus(match)==='confirmed'; }
function recordedMatchesInActiveRange(){
  return state.matches.filter(m=>(!m.status||m.status==='completed')&&dateInActiveRange(m.date));
}
function recordedMatchesAllRanges(){
  return state.matches.filter(m=>(!m.status||m.status==='completed'));
}
function completedMatchesInActiveRange(){
  return recordedMatchesInActiveRange().filter(isOfficialMatch);
}
function verificationBadge(match){
  const status=matchVerificationStatus(match);
  const label=status==='confirmed'?'Confirmed':status==='disputed'?'Disputed':'Pending confirmation';
  return `<span class="verification-badge ${status}">${label}</span>`;
}
const actionCooldownUntil=new Map();
function allowAction(key, milliseconds){
  const now=Date.now();
  if((actionCooldownUntil.get(key)||0)>now){ toast('Please wait a moment before trying that again'); return false; }
  actionCooldownUntil.set(key,now+Math.max(500,Number(milliseconds)||1500));
  return true;
}
function resultReviewActions(match){
  const status=matchVerificationStatus(match);
  const mayReview=canReviewMatch(match)||isAdminForClub(match&&match.clubId);
  if(!mayReview) return '';
  return `<div class="verification-actions">
    ${status!=='confirmed'?`<button class="btn btn-ball btn-sm" type="button" onclick="confirmMatchResult(${jsArg(match.id)})">Confirm</button>`:''}
    ${status!=='disputed'?`<button class="btn btn-ghost btn-sm" type="button" onclick="disputeMatchResult(${jsArg(match.id)})">Dispute</button>`:''}
  </div>`;
}
function currentUserIsMatchParticipant(match){
  return !!(state.myPlayerId&&match&&[...(match.team1||[]),...(match.team2||[])].includes(state.myPlayerId));
}
function canReviewMatch(match){
  if(!isSignedIn()||!currentUserIsMatchParticipant(match)) return false;
  return !match.recordedByUid||match.recordedByUid!==state.currentUser.uid;
}
async function confirmMatchResult(matchId){
  if(!allowAction(`confirm:${matchId}`,2000)) return;
  const match=state.matches.find(m=>m.id===matchId);
  if(!match||(!canReviewMatch(match)&&!isAdminForClub(match&&match.clubId))){ toast('Only another participating player or this club admin can confirm this result'); return; }
  if(matchVerificationStatus(match)==='confirmed'){ toast('This result is already confirmed'); return; }
  const now=new Date().toISOString();
  const clubAdminReview=isAdminForClub(match.clubId);
  const update={verificationStatus:'confirmed',confirmedByUid:state.currentUser.uid,confirmedByPlayerId:state.myPlayerId||null,confirmedAt:now,resolvedAt:clubAdminReview?now:null,resolvedByUid:clubAdminReview?state.currentUser.uid:null,disputeReason:null};
  try{ await MATCHES_COL.doc(matchId).update(update); }
  catch(e){ console.error(e); toast('Could not confirm the result. Publish the included Firestore rules first.'); return; }
  state.matches=state.matches.map(m=>m.id===matchId?{...m,...update}:m);
  toast('Result confirmed and included in official statistics');
  render();
}
async function disputeMatchResult(matchId){
  if(!allowAction(`dispute:${matchId}`,2000)) return;
  const match=state.matches.find(m=>m.id===matchId);
  if(!match||(!canReviewMatch(match)&&!isAdminForClub(match&&match.clubId))){ toast('Only another participating player or this club admin can dispute this result'); return; }
  const entered=prompt('Briefly explain what is incorrect about this result:','');
  if(entered===null) return;
  const reason=entered.trim();
  if(reason.length<3){ toast('Please provide a short reason for the dispute'); return; }
  const update={verificationStatus:'disputed',disputeReason:reason.slice(0,280),disputedByUid:state.currentUser.uid,disputedByPlayerId:state.myPlayerId||null,disputedAt:new Date().toISOString()};
  try{ await MATCHES_COL.doc(matchId).update(update); }
  catch(e){ console.error(e); toast('Could not dispute the result. Publish the included Firestore rules first.'); return; }
  state.matches=state.matches.map(m=>m.id===matchId?{...m,...update}:m);
  toast('Result disputed and removed from official statistics pending review');
  render();
}
function shuffle(arr){ const a=[...arr]; for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function playerName(id){ const p = state.players.find(x=>x.id===id); return p ? p.name : 'Former player'; }
function esc(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function diffPill(n, decimals){
  decimals = decimals===undefined?0:decimals;
  const cls = n>0?'diff-pos':(n<0?'diff-neg':'diff-zero');
  const sign = n>0?'+':'';
  return `<span class="diff-pill ${cls}">${sign}${n.toFixed(decimals)}</span>`;
}
function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(window.__toastT);
  window.__toastT = setTimeout(()=> el.classList.remove('show'), 2200);
}
function updateOnlineState(online){
  state.online=online;
  if(document.getElementById('root')) render();
  toast(online?'Back online - queued changes will synchronize':'Offline mode - saved changes will synchronize when connected');
}
if(typeof window!=='undefined'&&window.addEventListener){
  window.addEventListener('online',()=>updateOnlineState(true));
  window.addEventListener('offline',()=>updateOnlineState(false));
}
function setOfflineAccessPreference(enabled){
  if(typeof localStorage==='undefined'){ toast('Offline storage is unavailable in this browser'); return; }
  if(enabled) localStorage.setItem(OFFLINE_PREF_KEY,'enabled');
  else localStorage.removeItem(OFFLINE_PREF_KEY);
  toast('Offline-access preference saved. Reloading CourtRush...');
  setTimeout(()=>{ if(typeof location!=='undefined'&&location.reload) location.reload(); },500);
}
function paddleSVG(color){
  color = color || 'var(--court)';
  return `<svg class="paddle" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M12 1.75c-4.45 0-7.75 3.13-7.75 7.4 0 3.77 2.2 6.34 5.65 7.19v4.13c0 1.04.84 1.88 1.88 1.88h.44c1.04 0 1.88-.84 1.88-1.88v-4.13c3.45-.85 5.65-3.42 5.65-7.19 0-4.27-3.3-7.4-7.75-7.4Z" fill="${color}"/>
    <path d="M9.9 16.34h4.2M10.35 19.05h3.3" stroke="currentColor" stroke-width=".8" stroke-linecap="round" opacity=".25"/>
    <circle cx="8.7" cy="7.25" r=".9" fill="currentColor" opacity=".3"/>
    <circle cx="13.6" cy="5.45" r=".9" fill="currentColor" opacity=".3"/>
    <circle cx="15.2" cy="10.25" r=".9" fill="currentColor" opacity=".3"/>
    <circle cx="10.5" cy="11.4" r=".9" fill="currentColor" opacity=".3"/>
  </svg>`;
}

function scheduleDocId(sch){ return sch ? (sch.docId || sch.id || sch.date) : null; }
function scheduleById(id){ return state.schedules.find(s=> scheduleDocId(s)===id || s.id===id) || null; }
function jsArg(value){
  const safe=String(value)
    .replace(/\\/g,'\\\\')
    .replace(/'/g,"\\'")
    .replace(/\r/g,'\\r')
    .replace(/\n/g,'\\n')
    .replace(/&/g,'&amp;')
    .replace(/"/g,'&quot;')
    .replace(/</g,'\\x3C')
    .replace(/>/g,'\\x3E');
  return `'${safe}'`;
}
function stripScheduleMeta(sch){ const { docId, ...data } = sch; return data; }
function schedulePlayers(sch){
  if(!sch) return [];
  if(Array.isArray(sch.selectedPlayerIds) && sch.selectedPlayerIds.length) return [...new Set(sch.selectedPlayerIds)];
  const rounds = Array.isArray(sch.rounds) ? sch.rounds : [];
  return [...new Set(rounds.flatMap(rd=>[
    ...(rd.courts||[]).flatMap(ct=>[...(ct.team1||[]), ...(ct.team2||[])]),
    ...(rd.sitOuts||[])
  ]))];
}
function normalizeScheduleDoc(docId, data){
  const raw = data || {};
  const fallbackDate = /^\d{4}-\d{2}-\d{2}$/.test(docId) ? docId : todayStr();
  const sch = {
    ...raw,
    docId,
    id: raw.id || docId,
    date: raw.date || fallbackDate,
    startTime: raw.startTime || '',
    mode: raw.mode || 'open',
    format: raw.format || 'doubles',
    courts: Math.max(1, Number(raw.courts)||1),
    rounds: Array.isArray(raw.rounds) ? raw.rounds : [],
    recorded: raw.recorded || {},
    status: raw.status || 'published',
  };
  sch.selectedPlayerIds = schedulePlayers(sch);
  sch.numberOfRounds = Number(raw.numberOfRounds) || sch.rounds.length;
  return sch;
}
function upsertScheduleLocal(docId, data){
  const normalized = normalizeScheduleDoc(docId, data);
  const idx = state.schedules.findIndex(s=> scheduleDocId(s)===docId);
  if(idx>=0) state.schedules[idx] = normalized;
  else state.schedules.push(normalized);
  return normalized;
}
function scheduleRoundCount(sch){ return Array.isArray(sch&&sch.rounds) ? sch.rounds.length : 0; }
function scheduleGameCount(sch){ return (sch&&Array.isArray(sch.rounds)) ? sch.rounds.reduce((sum,rd)=>sum+(rd.courts||[]).length,0) : 0; }
function canManageSchedule(sch){ return !!(state.currentUser && sch && (isAdminForClub(sch.clubId||ACTIVE_CLUB_ID) || sch.createdBy===state.currentUser.uid)); }
function canManageHistoryGroup(group){ return !!(state.currentUser && group && (canManageSchedule(group.schedule) || group.createdBy===state.currentUser.uid || group.matches.some(m=>m.gamePlanCreatedBy===state.currentUser.uid||isAdminForClub(m.clubId||group.clubId||ACTIVE_CLUB_ID)))); }
function isScheduleEnded(sch){ return !!(sch && sch.status==='completed'); }
function isScheduleClosed(sch){ return !!(sch && (sch.status==='completed' || sch.status==='cancelled')); }
function scheduleStatusLabel(status){
  const labels={draft:'Draft',published:'Published',in_progress:'In progress',completed:'Ended',cancelled:'Cancelled'};
  return labels[status] || String(status||'Published').replace(/_/g,' ');
}
function scheduleRecordedCount(sch){
  return Object.values((sch&&sch.recorded)||{}).filter(id=>state.matches.some(m=>m.id===id)).length;
}
function scheduleUnplayedGameKeys(sch){
  if(!sch) return [];
  const recorded=sch.recorded||{};
  return (sch.rounds||[]).flatMap(rd=>(rd.courts||[]).map(ct=>`${rd.round}_${ct.court}`))
    .filter(key=>{
      const matchId=recorded[key];
      return !matchId || !state.matches.some(m=>m.id===matchId);
    });
}
function scheduleGameKey(round,court){ return `${round}_${court}`; }
function scheduleHasRecordedSlot(sch,round,court){
  const matchId=(sch&&sch.recorded||{})[scheduleGameKey(round,court)];
  return !!(matchId&&state.matches.some(m=>m.id===matchId));
}
function playerHasUnplayedScheduleSlot(sch,playerId){
  return (sch&&sch.rounds||[]).some(rd=>{
    if((rd.sitOuts||[]).includes(playerId)) return true;
    return (rd.courts||[]).some(ct=>{
      if(scheduleHasRecordedSlot(sch,rd.round,ct.court)) return false;
      return [...(ct.team1||[]),...(ct.team2||[])].includes(playerId);
    });
  });
}
function playerUnplayedScheduleSlotCount(sch,playerId){
  return (sch&&sch.rounds||[]).reduce((total,rd)=>{
    const sits=(rd.sitOuts||[]).includes(playerId) ? 1 : 0;
    const games=(rd.courts||[]).filter(ct=>!scheduleHasRecordedSlot(sch,rd.round,ct.court) && [...(ct.team1||[]),...(ct.team2||[])].includes(playerId)).length;
    return total+sits+games;
  },0);
}
function scheduleCourtNumbers(sch){
  return [...new Set((sch&&sch.rounds||[]).flatMap(rd=>(rd.courts||[]).map(ct=>Number(ct.court))))]
    .filter(Number.isFinite).sort((a,b)=>a-b);
}
function scheduleShortPlayerName(id, scopeIds=[]){
  const full=playerName(id).trim();
  if(!full || full==='Former player') return full || 'Former player';
  const parts=full.split(/\s+/).filter(Boolean);
  const first=parts[0]||full;
  const scope=(scopeIds&&scopeIds.length?scopeIds:state.players.map(p=>p.id))
    .map(pid=>playerName(pid).trim())
    .filter(Boolean);
  const firstKey=first.toLowerCase();
  const sameFirst=scope.filter(name=>(name.split(/\s+/)[0]||'').toLowerCase()===firstKey).length;
  return sameFirst>1 && parts.length>1 ? `${first} ${parts[1]}` : first;
}
function renderSchedulePlayerName(id, displayName){
  const mine=!!state.myPlayerId && id===state.myPlayerId;
  const player=state.players.find(p=>p.id===id);
  const meta=divisionMeta(player&&player.division);
  return `<span class="schedule-player-name ${mine?'player-name-self':''}">${esc(displayName||playerName(id))}<span class="schedule-division-badge" title="${esc(meta.label)} division" aria-label="${esc(meta.label)} division">${esc(meta.abbr)}</span>${mine?'<span class="player-you-tag">You</span>':''}</span>`;
}
function renderScheduleTeam(ids, scopeIds){
  const players=(ids||[]).map(pid=>renderSchedulePlayerName(pid,scopeIds?scheduleShortPlayerName(pid,scopeIds):null));
  return `<span class="team-names">${players.length?players.join('<span class="team-separator">&amp;</span>'):'-'}</span>`;
}
function formatDateTimeValue(value){
  if(!value) return '';
  const d=new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
}
function scheduleSortValue(sch){ return `${sch.date||'0000-00-00'}T${sch.startTime||'00:00'}`; }
function formatTime(time){
  if(!time || !/^\d{2}:\d{2}$/.test(time)) return 'Time not set';
  const [h,m] = time.split(':').map(Number);
  const d = new Date(2000,0,1,h,m,0,0);
  return d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
}
function addMinutesToTime(time, minutes){
  if(!time || !/^\d{2}:\d{2}$/.test(time)) return '-';
  const [h,m] = time.split(':').map(Number);
  const d = new Date(2000,0,1,h,m,0,0);
  d.setMinutes(d.getMinutes() + Math.max(0, Number(minutes)||0));
  return d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
}
function currentCreatorName(){ return state.myPlayerId ? playerName(state.myPlayerId) : (state.currentUser ? state.currentUser.email : 'Club player'); }
function sameIdSet(a,b){
  const aa=[...new Set(a||[])].sort(), bb=[...new Set(b||[])].sort();
  return aa.length===bb.length && aa.every((v,i)=>v===bb[i]);
}

/* ============================= STATS ============================= */
function playerMatches(pid){
  return completedMatchesInActiveRange().filter(m=> (m.team1||[]).includes(pid) || (m.team2||[]).includes(pid));
}
function computePlayerStats(pid){
  const ms = playerMatches(pid);
  let wins=0, losses=0, diffSum=0;
  const dateSet = new Set();
  ms.forEach(m=>{
    const onT1 = m.team1.includes(pid);
    const my = onT1 ? m.score1 : m.score2;
    const opp = onT1 ? m.score2 : m.score1;
    diffSum += (my-opp);
    if(my>opp) wins++; else if(my<opp) losses++;
    dateSet.add(m.date);
  });
  const gamesPlayed = ms.length;
  const avgDiff = gamesPlayed ? diffSum/gamesPlayed : 0;
  const dates = Array.from(dateSet).sort();
  let avgDaysPerWeek = 0, avgGamesPerWeek = 0;
  if(dates.length){
    const first = new Date(dates[0]+'T00:00:00');
    const last = new Date(dates[dates.length-1]+'T00:00:00');
    const weeksSpan = Math.max(1, Math.round((last-first)/(7*86400000))+1);
    avgDaysPerWeek = dates.length/weeksSpan;
    avgGamesPerWeek = gamesPlayed/weeksSpan;
  }
  return { gamesPlayed, wins, losses, diffSum, avgDiff, avgDaysPerWeek, avgGamesPerWeek, uniqueDays:dates.length };
}
function computeMatchupMatrix(pid){
  const map = {};
  completedMatchesInActiveRange().forEach(m=>{
    const onT1 = (m.team1||[]).includes(pid), onT2 = (m.team2||[]).includes(pid);
    if(!onT1 && !onT2) return;
    const myTeam = onT1 ? m.team1 : m.team2;
    const oppTeam = onT1 ? m.team2 : m.team1;
    const myScore = onT1 ? m.score1 : m.score2;
    const oppScore = onT1 ? m.score2 : m.score1;
    const diff = myScore - oppScore;
    myTeam.forEach(other=>{
      if(other===pid) return;
      map[other] = map[other] || {gamesWith:0,diffWith:0,gamesAgainst:0,diffAgainst:0};
      map[other].gamesWith++; map[other].diffWith += diff;
    });
    oppTeam.forEach(other=>{
      map[other] = map[other] || {gamesWith:0,diffWith:0,gamesAgainst:0,diffAgainst:0};
      map[other].gamesAgainst++; map[other].diffAgainst += diff;
    });
  });
  return map;
}
function computeH2H(idA, idB, clubId){
  const asOpp = { games:0, aWins:0, bWins:0, ties:0, diffSumA:0 };
  const asTeam = { games:0, wins:0, losses:0, ties:0, diffSum:0 };
  const oppMatches = [];
  completedMatchesInActiveRange().forEach(m=>{
    if(clubId&&clubId!=='all'&&(m.clubId||ACTIVE_CLUB_ID)!==clubId) return;
    const aInT1 = (m.team1||[]).includes(idA), aInT2 = (m.team2||[]).includes(idA);
    const bInT1 = (m.team1||[]).includes(idB), bInT2 = (m.team2||[]).includes(idB);
    if(!(aInT1||aInT2) || !(bInT1||bInT2)) return;
    if((aInT1&&bInT2) || (aInT2&&bInT1)){
      const aScore = aInT1 ? m.score1 : m.score2;
      const bScore = aInT1 ? m.score2 : m.score1;
      asOpp.games++; asOpp.diffSumA += (aScore-bScore);
      if(aScore>bScore) asOpp.aWins++; else if(bScore>aScore) asOpp.bWins++; else asOpp.ties++;
      oppMatches.push(m);
    } else if((aInT1&&bInT1) || (aInT2&&bInT2)){
      const myScore = aInT1 ? m.score1 : m.score2;
      const oppScore = aInT1 ? m.score2 : m.score1;
      asTeam.games++; asTeam.diffSum += (myScore-oppScore);
      if(myScore>oppScore) asTeam.wins++; else if(myScore<oppScore) asTeam.losses++; else asTeam.ties++;
    }
  });
  oppMatches.sort((x,y)=> y.date.localeCompare(x.date));
  return { asOpp, asTeam, oppMatches };
}
function computePlayerGameLog(pid){
  const ms = playerMatches(pid).slice().sort((a,b)=> a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  let running = 0;
  const rows = ms.map((m,idx)=>{
    const onT1 = m.team1.includes(pid);
    const partners = (onT1 ? m.team1 : m.team2).filter(x=>x!==pid);
    const opponents = onT1 ? m.team2 : m.team1;
    const myScore = onT1 ? m.score1 : m.score2;
    const oppScore = onT1 ? m.score2 : m.score1;
    const diff = myScore - oppScore;
    running += diff;
    return { id:m.id, scheduleId:m.scheduleId||null, gamePlanTitle:m.gamePlanTitle||'', gamePlanVenueName:m.gamePlanVenueName||'', startTime:m.startTime||'', clubId:m.clubId||ACTIVE_CLUB_ID, gameNum: idx+1, date: m.date, court: m.court, round:m.round, mode: m.mode||'open', partners, opponents, myScore, oppScore, diff, running };
  });
  return rows.reverse();
}
function scoutingReport(pid){
  const matrix = computeMatchupMatrix(pid);
  const asOpponents = Object.entries(matrix).filter(([,v])=> v.gamesAgainst>0)
    .map(([id,v])=> ({ id, avg: v.diffAgainst/v.gamesAgainst, games:v.gamesAgainst }));
  const asPartners = Object.entries(matrix).filter(([,v])=> v.gamesWith>0)
    .map(([id,v])=> ({ id, avg: v.diffWith/v.gamesWith, games:v.gamesWith }));
  const toughest = asOpponents.length ? asOpponents.slice().sort((a,b)=> a.avg-b.avg)[0] : null;
  const easiest = asOpponents.length ? asOpponents.slice().sort((a,b)=> b.avg-a.avg)[0] : null;
  const bestPartner = asPartners.length ? asPartners.slice().sort((a,b)=> b.avg-a.avg)[0] : null;
  return { toughest, easiest, bestPartner };
}
function computeGamePlanMvp(matches){
  const byPlayer={};
  const add=(pid,myScore,oppScore)=>{
    if(!pid) return;
    const row=byPlayer[pid]||(byPlayer[pid]={id:pid,games:0,wins:0,losses:0,diff:0});
    row.games++;
    row.diff+=myScore-oppScore;
    if(myScore>oppScore) row.wins++;
    else if(myScore<oppScore) row.losses++;
  };
  (matches||[]).forEach(m=>{
    const score1=Number(m.score1),score2=Number(m.score2);
    if(!Number.isFinite(score1)||!Number.isFinite(score2)) return;
    (m.team1||[]).forEach(pid=>add(pid,score1,score2));
    (m.team2||[]).forEach(pid=>add(pid,score2,score1));
  });
  const players=Object.values(byPlayer);
  if(!players.length) return {leaders:[],players:[],topWins:0,topLosses:0,bestDiff:0};
  const recordOrder=[...players].sort((a,b)=>b.wins-a.wins||a.losses-b.losses||b.diff-a.diff||playerName(a.id).localeCompare(playerName(b.id)));
  const topWins=recordOrder[0].wins;
  const topLosses=recordOrder[0].losses;
  const bestDiff=Math.max(...players.map(row=>row.diff));
  const leaders=players
    .filter(row=>row.wins===topWins&&row.losses===topLosses&&row.diff===bestDiff)
    .sort((a,b)=>playerName(a.id).localeCompare(playerName(b.id)));
  return {leaders,players,topWins,topLosses,bestDiff};
}
function mvpRaceDetail(mvp){
  const leaders=(mvp&&mvp.leaders)||[];
  if(!leaders.length) return '';
  const top=leaders[0];
  const leaderNames=leaders.map(row=>esc(playerName(row.id))).join(' &amp; ');
  const tiedLower=(mvp.players||[]).filter(row=>row.wins===top.wins&&row.losses===top.losses&&row.diff<top.diff);
  const diffText=`${top.diff>0?'+':''}${top.diff}`;
  const base=`${leaderNames} became ${leaders.length>1?'Co-MVPs':'MVP'} by tying the best W/L at ${top.wins}-${top.losses} and leading the +/- tiebreaker with ${diffText}.`;
  return tiedLower.length ? `${base} Player${tiedLower.length===1?'':'s'} with the same W/L had lower +/-, so they missed the award.` : base;
}
function computeScheduleLeaderboard(sch){
  const rows={};
  schedulePlayers(sch).forEach(pid=>{
    rows[pid]={id:pid,games:0,wins:0,losses:0,diff:0,winrate:0};
  });
  const add=(pid,myScore,oppScore)=>{
    if(!pid) return;
    const row=rows[pid]||(rows[pid]={id:pid,games:0,wins:0,losses:0,diff:0,winrate:0});
    row.games++;
    row.diff+=myScore-oppScore;
    if(myScore>oppScore) row.wins++;
    else if(myScore<oppScore) row.losses++;
  };
  const recordedIds=new Set(Object.values((sch&&sch.recorded)||{}));
  state.matches.filter(m=>recordedIds.has(m.id)&&isOfficialMatch(m)).forEach(match=>{
    const score1=Number(match.score1),score2=Number(match.score2);
    if(!Number.isFinite(score1)||!Number.isFinite(score2)) return;
    (match.team1||[]).forEach(pid=>add(pid,score1,score2));
    (match.team2||[]).forEach(pid=>add(pid,score2,score1));
  });
  return Object.values(rows).map(row=>({
    ...row,
    winrate:row.games?row.wins/row.games*100:0
  })).sort((a,b)=>b.wins-a.wins||a.losses-b.losses||b.diff-a.diff||playerName(a.id).localeCompare(playerName(b.id),undefined,{sensitivity:'base'}));
}
function openScheduleLeaderboard(id){ state.scheduleLeaderboardOpenId=id; render(); }
function closeScheduleLeaderboard(){ state.scheduleLeaderboardOpenId=null; render(); }
function computeMvpCounts(useActiveRange=true){
  const counts={};
  historyGamePlanGroups(useActiveRange).forEach(group=>{
    computeGamePlanMvp(group.matches.filter(isOfficialMatch)).leaders.forEach(row=>{ counts[row.id]=(counts[row.id]||0)+1; });
  });
  return counts;
}
function playerGamePlanCount(playerId,useActiveRange=true){
  return historyGamePlanGroups(useActiveRange).filter(group=>group.matches.some(m=>[...(m.team1||[]),...(m.team2||[])].includes(playerId))).length;
}
function clubMemberMatches(clubId,useActiveRange){
  const memberIds=new Set(membersForClub(clubId).map(p=>p.id));
  if(!memberIds.size) return [];
  const matches=state.matches.filter(m=>(!m.status||m.status==='completed')&&isOfficialMatch(m)&&(useActiveRange===false||dateInActiveRange(m.date)));
  const unique=new Map();
  matches.forEach(m=>{
    const participants=[...(m.team1||[]),...(m.team2||[])];
    if(!participants.some(id=>memberIds.has(id))) return;
    const key=m.id||`${m.scheduleId||'legacy'}:${m.date||''}:${m.startTime||''}:${m.round||''}:${m.court||''}`;
    if(!unique.has(key)) unique.set(key,m);
  });
  return [...unique.values()];
}
function playerClubSharedGameCount(playerId,clubId){
  const memberIds=new Set(membersForClub(clubId).map(p=>p.id).filter(id=>id!==playerId));
  if(!memberIds.size) return 0;
  const unique=new Set();
  state.matches
    .filter(m=>(!m.status||m.status==='completed')&&isOfficialMatch(m))
    .forEach(m=>{
      const participants=[...(m.team1||[]),...(m.team2||[])];
      if(!participants.includes(playerId) || !participants.some(id=>memberIds.has(id))) return;
      unique.add(m.id||`${m.scheduleId||'legacy'}:${m.date||''}:${m.startTime||''}:${m.round||''}:${m.court||''}`);
    });
  return unique.size;
}
function topClubForPlayerProfile(player){
  const clubs=activePlayerClubIds(player).map(id=>({id,games:playerClubSharedGameCount(player.id,id)}));
  if(!clubs.length) return null;
  clubs.sort((a,b)=>b.games-a.games||clubName(a.id).localeCompare(clubName(b.id),undefined,{sensitivity:'base'}));
  return clubs[0];
}
function renderPlayerTopClubChip(player){
  const top=topClubForPlayerProfile(player);
  return top?`<span class="club-chip" title="${top.games} shared club game${top.games===1?'':'s'}">${esc(clubName(top.id))}</span>`:'<span class="club-chip no-club">No Club</span>';
}
function renderPlayerProfileTopClub(player){
  const top=topClubForPlayerProfile(player);
  return top?`<span class="club-chip" title="${top.games} shared club game${top.games===1?'':'s'}">${esc(clubName(top.id))}</span>`:'<span class="small muted">Independent player</span>';
}
function compareClubPerformance(a,b){
  return b.games-a.games||b.mvp-a.mvp||b.members-a.members||a.club.name.localeCompare(b.club.name,undefined,{sensitivity:'base'});
}
function computeTopClub(){
  const mvpCounts=computeMvpCounts();
  return clubsForDisplay()
    .map(club=>{
      const members=membersForClub(club.id);
      return {
        club,
        games:clubMemberMatches(club.id,true).length,
        mvp:members.reduce((total,player)=>total+(mvpCounts[player.id]||0),0),
        members:members.length
      };
    })
    .filter(row=>row.games>0||row.mvp>0)
    .sort(compareClubPerformance)[0]||null;
}
function topClubsByMemberCount(){
  let previousCount=null,previousRank=0;
  return clubsForDisplay()
    .map(club=>({id:club.id,members:membersForClub(club.id).length,name:club.name}))
    .sort((a,b)=>b.members-a.members||a.name.localeCompare(b.name,undefined,{sensitivity:'base'}))
    .slice(0,3)
    .reduce((ranked,row,index)=>{
      const rank=row.members===previousCount?previousRank:index+1;
      previousCount=row.members;
      previousRank=rank;
      ranked[row.id]=rank;
      return ranked;
    },{});
}
function parseMembershipDateValue(value){
  if(!value) return null;
  const date=typeof value.toDate==='function'?value.toDate():new Date(value);
  return Number.isNaN(date.getTime())?null:date;
}
function clubMemberJoinedDate(clubId,playerId){
  const membership=clubMembershipRecord(clubId,playerId);
  if(!membership) return null;
  return parseMembershipDateValue(membership.joinedAt||membership.approvedAt||membership.createdAt||membership.requestedAt||membership.updatedAt);
}
function clubMemberDurationLabel(clubId,playerId){
  const joined=clubMemberJoinedDate(clubId,playerId);
  if(!joined) return '';
  const start=new Date(joined.getFullYear(),joined.getMonth(),joined.getDate());
  const now=new Date();
  const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const days=Math.max(0,Math.floor((today-start)/86400000));
  return `Member for ${days} day${days===1?'':'s'}`;
}
function playerMatchesForClub(pid,clubId,useActiveRange){
  return state.matches.filter(m=>(!m.status||m.status==='completed')&&isOfficialMatch(m)&&(useActiveRange===false||dateInActiveRange(m.date))&&(m.clubId||ACTIVE_CLUB_ID)===clubId&&([...(m.team1||[]),...(m.team2||[])]).includes(pid));
}
function computePlayerClubStats(pid,clubId,useActiveRange){
  const ms=playerMatchesForClub(pid,clubId,useActiveRange);
  let wins=0,losses=0;
  ms.forEach(m=>{
    const onT1=(m.team1||[]).includes(pid);
    const my=onT1?m.score1:m.score2;
    const opp=onT1?m.score2:m.score1;
    if(my>opp) wins++;
    else if(my<opp) losses++;
  });
  return {gamesPlayed:ms.length,wins,losses};
}
function clubMvpLeaders(clubId,useActiveRange=true){
  const counts=computeMvpCounts(useActiveRange);
  let previousCount=null,previousRank=0;
  return membersForClub(clubId)
    .map(player=>({player,mvp:counts[player.id]||0,stats:computePlayerClubStats(player.id,clubId,useActiveRange)}))
    .filter(row=>row.mvp>0)
    .sort((a,b)=>b.mvp-a.mvp||b.stats.wins-a.stats.wins||a.stats.losses-b.stats.losses||a.player.name.localeCompare(b.player.name,undefined,{sensitivity:'base'}))
    .slice(0,5)
    .map((row,index)=>{
      const rank=row.mvp===previousCount?previousRank:index+1;
      previousCount=row.mvp;
      previousRank=rank;
      return {...row,rank};
    });
}
function mvpPill(count){
  const value=Number(count)||0;
  return `<span class="mvp-pill ${value?'':'zero'}" title="MVP Game Plans: most wins, then fewest losses, plus the highest total +/-">${value}</span>`;
}
const ROSTER_SORT_KEYS=new Set(['clubs','games','record','mvp']);
const ROSTER_PAGE_SIZE=10;
function setRosterSortKey(key){
  if(!ROSTER_SORT_KEYS.has(key)) return;
  if(state.rosterSortKey!==key) state.rosterSortDirection=key==='clubs'?'asc':'desc';
  state.rosterSortKey=key;
  if(key!=='clubs') state.rosterClubFilterOpen=false;
  state.rosterPage=1;
  render();
}
function setRosterSortDirection(direction){
  if(direction!=='asc'&&direction!=='desc') return;
  state.rosterSortDirection=direction;
  state.rosterPage=1;
  render();
}
function setRosterSearchQuery(value){
  state.rosterSearchQuery=String(value||'').trimStart().slice(0,80);
  state.rosterPage=1;
  render();
}
function setRosterPage(page){
  state.rosterPage=Math.max(1,Number(page)||1);
  render();
}
const ROSTER_NO_CLUB='__none__';
function rosterClubFilterOptions(){
  const ids=new Set();
  state.players.forEach(player=>{
    const playerClubs=activePlayerClubIds(player);
    if(playerClubs.length) playerClubs.forEach(id=>ids.add(id));
  });
  const options=[...ids].map(id=>({id,label:clubName(id)})).sort((a,b)=>a.label.localeCompare(b.label,undefined,{sensitivity:'base'}));
  options.push({id:ROSTER_NO_CLUB,label:'No Club'});
  return options;
}
function selectedRosterClubFilterIds(options){
  const valid=new Set(options.map(option=>option.id));
  if(!Array.isArray(state.rosterClubFilterIds)) return new Set(valid);
  return new Set(state.rosterClubFilterIds.filter(id=>valid.has(id)));
}
function toggleRosterClubFilter(id,checked){
  const options=rosterClubFilterOptions();
  const validIds=options.map(option=>option.id);
  if(!validIds.includes(id)) return;
  const selected=selectedRosterClubFilterIds(options);
  if(checked) selected.add(id); else selected.delete(id);
  state.rosterClubFilterIds=[...selected];
  state.rosterPage=1;
  render();
}
function selectAllRosterClubFilters(){ state.rosterClubFilterIds=null; state.rosterPage=1; render(); }
function clearRosterClubFilters(){ state.rosterClubFilterIds=[]; state.rosterPage=1; render(); }
function setRosterClubFilterOpen(open){ state.rosterClubFilterOpen=!!open; }
function applyRosterClubSearch(input){
  const value=(input&&input.value?input.value:'').trimStart().slice(0,80);
  state.rosterClubFilterSearch=value;
  if(input&&input.value!==value) input.value=value;
  const menu=input?input.closest('.roster-club-options'):null;
  if(!menu) return;
  const query=value.trim().toLowerCase();
  let visible=0;
  menu.querySelectorAll('.roster-club-option').forEach(option=>{
    const match=!query||(option.dataset.clubLabel||'').includes(query);
    option.hidden=!match;
    if(match) visible++;
  });
  const empty=menu.querySelector('[data-roster-club-empty]');
  if(empty) empty.hidden=visible>0;
}
function toggleProfileSettings(open){ state.profileSettingsOpen=!!open; }
function rosterPlayerMatchesClubFilter(player){
  if(!Array.isArray(state.rosterClubFilterIds)) return true;
  const selected=new Set(state.rosterClubFilterIds);
  const clubIds=activePlayerClubIds(player);
  return clubIds.length?clubIds.some(id=>selected.has(id)):selected.has(ROSTER_NO_CLUB);
}
function rosterClubFilterSummary(options){
  if(!Array.isArray(state.rosterClubFilterIds)) return options.length?`All clubs (${options.length})`:'No clubs';
  const selected=selectedRosterClubFilterIds(options);
  if(!selected.size) return 'No clubs selected';
  if(selected.size===options.length) return `All clubs (${options.length})`;
  if(selected.size===1){ const only=options.find(option=>selected.has(option.id)); return only?only.label:'1 club selected'; }
  return `${selected.size} clubs selected`;
}
function renderRosterClubFilter(options){
  const selected=selectedRosterClubFilterIds(options);
  const search=(state.rosterClubFilterSearch||'').trim().toLowerCase();
  const visibleOptions=search?options.filter(option=>option.label.toLowerCase().includes(search)):options;
  return `<div class="roster-sort-control roster-club-filter"><label>Show clubs</label><details class="roster-club-menu" ${state.rosterClubFilterOpen?'open':''} ontoggle="setRosterClubFilterOpen(this.open)"><summary>${esc(rosterClubFilterSummary(options))}</summary><div class="roster-club-options"><div class="roster-club-search"><input type="search" value="${esc(state.rosterClubFilterSearch||'')}" placeholder="Search clubs..." aria-label="Search clubs" oninput="applyRosterClubSearch(this)" onclick="event.stopPropagation()"/></div>${options.length?options.map(option=>`<label class="roster-club-option" data-club-label="${esc(option.label.toLowerCase())}" ${search&&!option.label.toLowerCase().includes(search)?'hidden':''}><input type="checkbox" ${selected.has(option.id)?'checked':''} onchange="toggleRosterClubFilter(${jsArg(option.id)},this.checked)"/><span>${esc(option.label)}</span></label>`).join(''):'<div class="small muted" style="padding:8px;">No club options available.</div>'}<div class="small muted" data-roster-club-empty ${visibleOptions.length?'hidden':''} style="padding:8px;">No matching clubs.</div><div class="roster-club-filter-actions"><button class="btn btn-ghost btn-sm" type="button" onclick="selectAllRosterClubFilters()">Select all</button><button class="btn btn-ghost btn-sm" type="button" onclick="clearRosterClubFilters()">Clear</button></div></div></details></div>`;
}
function toggleRosterSort(key){
  if(!ROSTER_SORT_KEYS.has(key)) return;
  if(state.rosterSortKey===key){
    state.rosterSortDirection=state.rosterSortDirection==='asc'?'desc':'asc';
  }else{
    state.rosterSortKey=key;
    state.rosterSortDirection=key==='clubs'?'asc':'desc';
  }
  state.rosterPage=1;
  render();
}
function compareRosterRows(a,b,key){
  if(key==='clubs'){
    const aClubs=activePlayerClubIds(a.player).map(clubName).sort((x,y)=>x.localeCompare(y,undefined,{sensitivity:'base'})).join(' - ');
    const bClubs=activePlayerClubIds(b.player).map(clubName).sort((x,y)=>x.localeCompare(y,undefined,{sensitivity:'base'})).join(' - ');
    return aClubs.localeCompare(bClubs,undefined,{sensitivity:'base'});
  }
  if(key==='games') return a.stats.gamesPlayed-b.stats.gamesPlayed;
  if(key==='mvp') return a.mvp-b.mvp;
  if(key==='record'){
    if(a.stats.wins!==b.stats.wins) return a.stats.wins-b.stats.wins;
    if(a.stats.losses!==b.stats.losses) return b.stats.losses-a.stats.losses;
    return a.stats.gamesPlayed-b.stats.gamesPlayed;
  }
  return a.player.name.localeCompare(b.player.name,undefined,{sensitivity:'base'});
}
function sortRosterRows(rows){
  const requestedKey=ROSTER_SORT_KEYS.has(state.rosterSortKey)?state.rosterSortKey:'clubs';
  const key=(!isSignedIn()&&['games','record','mvp'].includes(requestedKey))?'clubs':requestedKey;
  const direction=state.rosterSortDirection==='desc'?'desc':'asc';
  return [...rows].sort((a,b)=>{
    if(key==='clubs'){
      const aHasClubs=activePlayerClubIds(a.player).length>0;
      const bHasClubs=activePlayerClubIds(b.player).length>0;
      if(aHasClubs!==bHasClubs) return aHasClubs?-1:1;
    }
    const primary=compareRosterRows(a,b,key);
    if(primary!==0) return direction==='desc'?-primary:primary;
    return a.player.name.localeCompare(b.player.name,undefined,{sensitivity:'base'});
  });
}
function rosterSortHeader(key,label){
  const active=state.rosterSortKey===key;
  const indicator=active?(state.rosterSortDirection==='asc'?'up':'down'):'sort';
  const next=active?(state.rosterSortDirection==='asc'?'descending':'ascending'):(key==='clubs'?'ascending':'descending');
  return `<button type="button" class="roster-sort-header ${active?'active':''}" onclick="toggleRosterSort(${jsArg(key)})" aria-label="Sort ${esc(label)} ${next}">${esc(label)}<span class="roster-sort-indicator" aria-hidden="true">${indicator}</span></button>`;
}

/* ============================= SCHEDULE ALGORITHM ============================= */
function pairKey(a,b){ return [a,b].sort().join('|'); }
const DIVISION_RANKS={novice:1,beginner:2,intermediate:3,advanced:4,pro:5};
function playerDivisionRank(playerId){
  const player=state.players.find(p=>p.id===playerId);
  return DIVISION_RANKS[playerDivisionValue(player)]||1;
}
function teamDivisionAverage(team){
  return (team||[]).reduce((sum,id)=>sum+playerDivisionRank(id),0)/Math.max(1,(team||[]).length);
}
function divisionMatchSpread(teamA,teamB){
  return Math.abs(teamDivisionAverage(teamA)-teamDivisionAverage(teamB));
}
function divisionPartnerSpread(team){
  if(!team||team.length<2) return 0;
  return Math.max(...team.map(playerDivisionRank))-Math.min(...team.map(playerDivisionRank));
}
function playerIsNoviceDivision(playerId){
  const player=state.players.find(p=>p.id===playerId);
  return playerDivisionValue(player)==='novice';
}
function novicePartnerPenalty(team){
  if(!team||team.length!==2) return 0;
  return playerIsNoviceDivision(team[0])===playerIsNoviceDivision(team[1]) ? 1 : 0;
}
function divisionMismatchPenalty(teamA,teamB){
  const all=[...(teamA||[]),...(teamB||[])];
  if(all.length<2) return 0;
  const ranks=all.map(playerDivisionRank);
  return Math.max(...ranks)-Math.min(...ranks);
}
function sameDivisionCourtPool(pool,size){
  const groups={};
  pool.forEach(id=>{
    const key=playerDivisionValue(state.players.find(p=>p.id===id));
    if(!groups[key]) groups[key]=[];
    groups[key].push(id);
  });
  const candidates=Object.values(groups).filter(group=>group.length>=size);
  if(!candidates.length) return null;
  candidates.sort((a,b)=>b.length-a.length || Math.random()-0.5);
  return shuffle(candidates[0]).slice(0,size);
}
function balancedNoviceDoublesCourtPool(pool){
  const novices=shuffle(pool.filter(playerIsNoviceDivision));
  const nonNovices=shuffle(pool.filter(id=>!playerIsNoviceDivision(id)));
  if(novices.length>=2 && nonNovices.length>=2) return [...novices.slice(0,2),...nonNovices.slice(0,2)];
  return null;
}
function removeCourtPool(pool,courtPool){
  const picked=new Set(courtPool);
  return pool.filter(id=>!picked.has(id));
}

// Classic round-robin "circle method": fixes one player, rotates the rest.
// Produces (M-1) rounds of M/2 pairs, where M is even (padded with BYE tokens if needed),
// and every player is paired with every other player across all rounds exactly once.
function buildCircleRounds(playerIds){
  let pool = [...playerIds];
  let byes = 0;
  while(pool.length % 2 !== 0){ pool.push('BYE_'+(byes++)); }
  const M = pool.length;
  if(M < 2) return [];
  const fixed = pool[0];
  const rot = pool.slice(1);
  const totalRounds = M - 1;
  const rounds = [];
  for(let r=0; r<totalRounds; r++){
    const pairs = [[fixed, rot[r % (M-1)]]];
    for(let i=1; i<M/2; i++){
      const a = rot[(r+i) % (M-1)];
      const b = rot[(r-i+(M-1)) % (M-1)];
      pairs.push([a,b]);
    }
    rounds.push(pairs);
  }
  return rounds;
}
function isBye(x){ return String(x).startsWith('BYE_'); }
function oppScore(teamA, teamB, opponentCount){
  let s=0;
  teamA.forEach(a=> teamB.forEach(b=> s += (opponentCount[pairKey(a,b)]||0)));
  return s;
}
function openPlayOpponentScore(teamA,teamB,opponentCount){
  return oppScore(teamA,teamB,opponentCount)*10 + divisionMismatchPenalty(teamA,teamB)*0.15 + divisionMatchSpread(teamA,teamB)*0.05;
}
function openPlayPartnerScore(team,partnerCount){
  const repeat=team.length===2 ? (partnerCount[pairKey(team[0],team[1])]||0) : 0;
  return repeat*10 + novicePartnerPenalty(team)*0.2 + divisionPartnerSpread(team)*0.05;
}

// Guaranteed round robin - used whenever the group actually fits on the courts available,
// so every player partners with (and eventually faces) every other player exactly once.
function generateScheduleRoundRobin({playerIds, format}){
  const opponentCount = {};
  playerIds.forEach(a=> playerIds.forEach(b=>{ if(a!==b) opponentCount[pairKey(a,b)]=0; }));

  if(format==='singles'){
    return buildCircleRounds(playerIds).map((pairs, idx)=>{
      const sitOuts = [];
      const courtsArr = [];
      let c=1;
      pairs.forEach(([a,b])=>{
        if(isBye(a) && isBye(b)) return;
        if(isBye(a)){ sitOuts.push(b); return; }
        if(isBye(b)){ sitOuts.push(a); return; }
        courtsArr.push({court:c++, team1:[a], team2:[b]});
      });
      return {round: idx+1, sitOuts, courts: courtsArr};
    });
  }

  // doubles: first pass builds guaranteed-unique partnerships via the circle method,
  // second pass greedily matches those partnerships against each other, minimizing repeat opponents.
  return buildCircleRounds(playerIds).map((pairs, idx)=>{
    const sitOuts = [];
    const partnerships = [];
    pairs.forEach(([a,b])=>{
      if(isBye(a) && isBye(b)) return;
      if(isBye(a)){ sitOuts.push(b); return; }
      if(isBye(b)){ sitOuts.push(a); return; }
      partnerships.push([a,b]);
    });
    let pool = shuffle(partnerships.map((_,i)=>i));
    const courtsArr = [];
    let c=1;
    while(pool.length>=2){
      const i = pool.shift();
      pool.sort((x,y)=> openPlayOpponentScore(partnerships[i],partnerships[x],opponentCount) - openPlayOpponentScore(partnerships[i],partnerships[y],opponentCount));
      const j = pool.shift();
      const team1 = partnerships[i], team2 = partnerships[j];
      team1.forEach(p1=> team2.forEach(p2=> opponentCount[pairKey(p1,p2)]++));
      courtsArr.push({court:c++, team1, team2});
    }
    pool.forEach(i=> sitOuts.push(...partnerships[i]));
    return {round: idx+1, sitOuts, courts: courtsArr};
  });
}

// Fallback for when there are more players than the available courts can hold at once -
// a perfect one-time-only pairing cannot be guaranteed here, so this rotates fairly and
// minimizes repeats as best it can across the auto-calculated round count.
function buildGreedyRound(playerIds, usableCourts, capacity, format, partnerCount, opponentCount, sitOutCount, priorityRank, gameCount, lastPlayedIds){
  const key = pairKey;
  const neededPerCourt=format==='singles'?2:4;
  const totalNeeded=Math.min(playerIds.length,Math.max(1,usableCourts)*neededPerCourt);
  const numSitOut = Math.max(0, playerIds.length - totalNeeded);
  const rank=priorityRank||{};
  const games=gameCount||{};
  const previous=new Set(lastPlayedIds||[]);
  const order = [...playerIds].sort((a,b)=>
    (games[a]||0)-(games[b]||0) ||
    (previous.has(a)?1:0)-(previous.has(b)?1:0) ||
    (sitOutCount[b]||0)-(sitOutCount[a]||0) ||
    (rank[a]||0)-(rank[b]||0) ||
    playerName(a).localeCompare(playerName(b),undefined,{sensitivity:'base'}) ||
    (Math.random()-0.5)
  );
  let playPool=order.slice(0,totalNeeded);
  if(previous.size && playerIds.length-previous.size>=neededPerCourt){
    const fresh=order.filter(id=>!previous.has(id));
    const repeats=order.filter(id=>previous.has(id));
    playPool=[...fresh.slice(0,totalNeeded),...repeats].slice(0,totalNeeded);
  }
  const playSet=new Set(playPool);
  const sitOuts = numSitOut>0 ? playerIds.filter(id=>!playSet.has(id)).sort((a,b)=>
    (games[b]||0)-(games[a]||0) ||
    (sitOutCount[a]||0)-(sitOutCount[b]||0) ||
    playerName(a).localeCompare(playerName(b),undefined,{sensitivity:'base'})
  ) : [];
  sitOuts.forEach(id=> sitOutCount[id]++);
  let pool = [...playPool].sort((a,b)=>
    (games[a]||0)-(games[b]||0) ||
    (previous.has(a)?1:0)-(previous.has(b)?1:0) ||
    playerName(a).localeCompare(playerName(b),undefined,{sensitivity:'base'}) ||
    (Math.random()-0.5)
  );
  const courtsArr = [];
  for(let c=1; c<=usableCourts; c++){
    const needed=neededPerCourt;
    if(pool.length < needed) break;
    let courtPool=[...pool];
    if(format==='singles'){
      const a = courtPool.shift();
      courtPool.sort((x,y)=> (divisionMismatchPenalty([a],[x])*100 + opponentCount[key(a,x)] + divisionMatchSpread([a],[x])*0.35) - (divisionMismatchPenalty([a],[y])*100 + opponentCount[key(a,y)] + divisionMatchSpread([a],[y])*0.35));
      const b = courtPool.shift();
      pool=removeCourtPool(pool,[a,b]);
      [a,b].forEach(id=>games[id]=(games[id]||0)+1);
      opponentCount[key(a,b)]++;
      courtsArr.push({court:c, team1:[a], team2:[b]});
    } else {
      const a = courtPool.shift();
      courtPool.sort((x,y)=> openPlayPartnerScore([a,x],partnerCount) - openPlayPartnerScore([a,y],partnerCount));
      const b = courtPool.shift();
      partnerCount[key(a,b)]++;
      courtPool.sort((x,y)=>{
        const sx = opponentCount[key(a,x)]+opponentCount[key(b,x)] + divisionMatchSpread([a,b],[x])*0.35;
        const sy = opponentCount[key(a,y)]+opponentCount[key(b,y)] + divisionMatchSpread([a,b],[y])*0.35;
        return sx-sy;
      });
      const c1 = courtPool.shift();
      courtPool.sort((x,y)=>{
        const sx = openPlayPartnerScore([c1,x],partnerCount) + opponentCount[key(a,x)] + opponentCount[key(b,x)] + divisionMatchSpread([a,b],[c1,x])*0.35;
        const sy = openPlayPartnerScore([c1,y],partnerCount) + opponentCount[key(a,y)] + opponentCount[key(b,y)] + divisionMatchSpread([a,b],[c1,y])*0.35;
        return sx-sy;
      });
      const d1 = courtPool.shift();
      pool=removeCourtPool(pool,[a,b,c1,d1]);
      [a,b,c1,d1].forEach(id=>games[id]=(games[id]||0)+1);
      partnerCount[key(c1,d1)]++;
      [a,b].forEach(p1=> [c1,d1].forEach(p2=> opponentCount[key(p1,p2)]++));
      courtsArr.push({court:c, team1:[a,b], team2:[c1,d1]});
    }
  }
  return { sitOuts, courts: courtsArr };
}
function generateScheduleGreedy({playerIds, courts, format}){
  const rounds = autoRoundCount(playerIds.length);
  const capacityPerCourt = format==='singles' ? 2 : 4;
  const usableCourts = Math.max(1, Math.min(courts, Math.floor(playerIds.length/capacityPerCourt)));
  const capacity = usableCourts*capacityPerCourt;
  const sitOutCount = {}; playerIds.forEach(id=> sitOutCount[id]=0);
  const gameCount = {}; playerIds.forEach(id=> gameCount[id]=0);
  const partnerCount = {}, opponentCount = {};
  playerIds.forEach(a=> playerIds.forEach(b=>{ if(a!==b){ partnerCount[pairKey(a,b)]=0; opponentCount[pairKey(a,b)]=0; } }));
  const roundsOut = [];
  for(let r=1; r<=rounds; r++){
    const previous=roundsOut.length?playersInRound(roundsOut[roundsOut.length-1]):[];
    const { sitOuts, courts:courtsArr } = buildGreedyRound(playerIds, usableCourts, capacity, format, partnerCount, opponentCount, sitOutCount, null, gameCount, previous);
    roundsOut.push({round:r, sitOuts, courts:courtsArr});
  }
  return roundsOut;
}

function generateSchedule({playerIds, courts, format}){
  return generateScheduleGreedy({playerIds, courts, format});
}

/* ============================= ACTIONS ============================= */
function openAuthModal(mode){ state.navOpen=false; state.showAuthModal=true; state.authMode=mode||'login'; render(); }
function closeAuthModal(){ state.showAuthModal=false; render(); }
function googleLogo(){
  return `<svg class="google-mark" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.715v2.259h2.909c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.909-2.259c-.806.54-1.835.859-3.047.859-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.963 10.706A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.168.281-1.706V4.962H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.038l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.507.454 3.44 1.345l2.581-2.581C13.463.892 11.426 0 9 0A9 9 0 0 0 .956 4.962l3.007 2.332C4.672 5.165 6.656 3.58 9 3.58z"/></svg>`;
}
async function ensureGooglePlayerProfile(user, requestedClubId){
  const userRef=USERS_COL.doc(user.uid);
  const userSnap=await userRef.get();
  const saved=userSnap.exists?userSnap.data():{};
  const email=user.email||saved.email||'';
  const googleName=(user.displayName||'').trim();
  const name=(saved.displayName||googleName||(email?email.split('@')[0]:'Club player')).trim();
  const photoURL=user.photoURL||saved.photoURL||'';
  const requestedClub=requestedClubId&&clubById(requestedClubId)?requestedClubId:null;
  const savedClubIds=Array.isArray(saved.clubIds)?saved.clubIds.filter(Boolean):(saved.clubId?[saved.clubId]:[]);
  let playerId=saved.playerId||null;
  let player=playerId?state.players.find(p=>p.id===playerId):null;
  if(!playerId){
    player=state.players.find(p=>p.ownerUid===user.uid)||state.players.find(p=>!p.ownerUid&&playerEmail(p)===normalizeEmail(email))||state.players.find(p=>!p.ownerUid&&p.name.trim().toLowerCase()===name.toLowerCase()&&(!requestedClub||playerIsMemberOfClub(p,requestedClub)||pendingClubInvite(requestedClub,p.id)))||null;
    playerId=player?player.id:uid('pl');
  }
  const playerRef=PLAYERS_COL.doc(playerId);
  const existingClubIds=player?playerClubIds(player):[];
  const clubIds=[...new Set([...existingClubIds,...savedClubIds])].filter(id=>!!clubById(id));
  const primaryClubId=saved.clubId||clubIds[0]||null;
  if(player){
    const updates={ownerUid:user.uid,email,guest:false,clubId:primaryClubId,clubIds};
    if(photoURL) updates.avatarUrl=photoURL;
    await playerRef.set(updates,{merge:true});
  }else{
    await playerRef.set({id:playerId,player_id:playerId,name,guest:false,email,clubId:primaryClubId,clubIds,createdAt:new Date().toISOString(),ownerUid:user.uid,...(photoURL?{avatarUrl:photoURL}:{})});
  }
  const joinRequested=!!(requestedClub&&!clubIds.includes(requestedClub)&&!pendingClubInvite(requestedClub,playerId));
  if(joinRequested){
    const membershipId=clubMembershipId(requestedClub,playerId);
    const now=new Date().toISOString();
    await CLUB_MEMBERSHIPS_COL.doc(membershipId).set({id:membershipId,clubId:requestedClub,playerId,status:'pending',requestedByUid:user.uid,requestedAt:now,updatedAt:now},{merge:true});
  }
  await userRef.set({displayName:name,email,role:saved.role||'player',clubId:primaryClubId,clubIds,playerId,photoURL,authProvider:'google.com',updatedAt:new Date().toISOString(),...(saved.createdAt?{}:{createdAt:new Date().toISOString()})},{merge:true});
  return {playerId,name,joinRequested,requestedClub};
}
async function signInWithGoogle(){
  if(state.authBusy) return;
  const clubEl=document.getElementById('auth_club');
  const requestedClubId=state.authMode==='register'&&clubEl?clubEl.value:'';
  state.authBusy=true; render();
  try{
    const provider=new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({prompt:'select_account'});
    const result=await auth.signInWithPopup(provider);
    const linked=await ensureGooglePlayerProfile(result.user,requestedClubId);
    state.showAuthModal=false;
    toast(linked.joinRequested?`Welcome, ${linked.name}! Your request to join ${clubName(linked.requestedClub)} was sent.`:`Welcome, ${linked.name}!`);
  }catch(e){
    console.error(e);
    if(e&&e.code==='auth/account-exists-with-different-credential') toast('This email already uses password sign-in. Sign in with your password to keep the same player account.');
    else if(e&&e.code==='auth/popup-closed-by-user') toast('Google sign-in was cancelled');
    else if(e&&e.code==='auth/popup-blocked') toast('Allow pop-ups for CourtRush, then try Google sign-in again');
    else toast(e&&e.message?e.message.replace('Firebase: ',''):'Google sign-in could not be completed');
  }
  state.authBusy=false; render();
}
async function sendPasswordResetFromModal(){
  if(state.authBusy) return;
  const emailEl=document.getElementById('auth_email');
  const email=emailEl?emailEl.value.trim():'';
  if(!email||!/^\S+@\S+\.\S+$/.test(email)){ toast('Enter your email address first'); return; }
  state.authBusy=true; render();
  try{
    if(typeof auth.useDeviceLanguage==='function') auth.useDeviceLanguage();
    await auth.sendPasswordResetEmail(email);
    state.showAuthModal=false;
    toast('If that email has a password account, a recovery link has been sent');
  }catch(e){
    console.error(e);
    if(e&&e.code==='auth/too-many-requests') toast('Too many attempts. Please wait before trying again.');
    else toast('Could not send the recovery email. Check the address and try again.');
  }
  state.authBusy=false; render();
}
async function submitAuthForm(ev){
  ev.preventDefault();
  const mode = state.authMode;
  const email = document.getElementById('auth_email').value.trim();
  const password = document.getElementById('auth_password').value;
  const name = mode==='register' ? document.getElementById('auth_name').value.trim() : null;
  const registrationClubEl=mode==='register'?document.getElementById('auth_club'):null;
  const registrationClubId=registrationClubEl&&clubById(registrationClubEl.value)?registrationClubEl.value:null;
  if(!email || !password){ toast('Enter email and password'); return; }
  if(mode==='register' && !name){ toast('Enter your player name'); return; }
  state.authBusy = true; render();
  try{
    if(mode==='register'){
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      // Link to an existing unclaimed roster entry with a matching name if one exists,
      // so an admin-added player history isn't duplicated when they register.
      const normalizedEmail=normalizeEmail(email);
      const existing = state.players.find(p=> !p.ownerUid && playerEmail(p)===normalizedEmail)||state.players.find(p=> !p.ownerUid && p.name.trim().toLowerCase()===name.toLowerCase() && (!registrationClubId||playerIsMemberOfClub(p,registrationClubId)||pendingClubInvite(registrationClubId,p.id)));
      let playerId;
      let registeredClubIds=[];
      if(existing){
        playerId = existing.id;
        registeredClubIds=[...new Set(playerClubIds(existing))];
        await PLAYERS_COL.doc(playerId).update({ ownerUid: cred.user.uid, email:normalizedEmail, guest:false, clubId:existing.clubId||registeredClubIds[0]||null, clubIds:registeredClubIds });
      } else {
        playerId = uid('pl');
        await PLAYERS_COL.doc(playerId).set({ id:playerId, player_id:playerId, name, guest:false, email:normalizedEmail, clubId:null, clubIds:[], createdAt:new Date().toISOString(), ownerUid:cred.user.uid });
      }
      const joinRequested=!!(registrationClubId&&!registeredClubIds.includes(registrationClubId)&&!pendingClubInvite(registrationClubId,playerId));
      if(joinRequested){
        const membershipId=clubMembershipId(registrationClubId,playerId);
        const now=new Date().toISOString();
        await CLUB_MEMBERSHIPS_COL.doc(membershipId).set({id:membershipId,clubId:registrationClubId,playerId,status:'pending',requestedByUid:cred.user.uid,requestedAt:now,updatedAt:now});
      }
      await USERS_COL.doc(cred.user.uid).set({ displayName:name, email, role:'player', clubId:registeredClubIds[0]||null, clubIds:registeredClubIds, playerId, createdAt:new Date().toISOString() });
      toast(joinRequested?`Welcome, ${name}! Your request to join ${clubName(registrationClubId)} was sent.`:`Welcome to CourtRush, ${name}!`);
    } else {
      await auth.signInWithEmailAndPassword(email, password);
      toast('Signed in');
    }
    state.showAuthModal = false;
  }catch(e){
    toast(e.message ? e.message.replace('Firebase: ','') : 'Something went wrong');
  }
  state.authBusy = false;
  render();
}
async function logoutUser(){
  await auth.signOut();
  state.profileNameEditing=false;
  state.profileNameBusy=false;
  toast('Signed out');
}
function avatarHTML(player, size){
  size = size || 40;
  const initial = player && player.name ? player.name.trim().charAt(0).toUpperCase() : '?';
  let avatarUrl='';
  try{ const parsed=new URL(player&&player.avatarUrl||''); if(parsed.protocol==='https:') avatarUrl=parsed.href; }catch(_e){}
  return `<span class="avatar-frame" style="width:${size}px;height:${size}px;">${avatarUrl?`<img class="avatar-image" src="${esc(avatarUrl)}" alt="" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"/><span class="avatar-fallback" style="display:none;font-size:${Math.round(size*0.45)}px;">${esc(initial)}</span>`:`<span class="avatar-fallback" style="display:flex;font-size:${Math.round(size*0.45)}px;">${esc(initial)}</span>`}</span>`;
}
function profileVisibilityValue(player){
  const value=player&&player.profileVisibility;
  return value==='club'||value==='private'||value==='public'?value:'public';
}
const PLAYER_DIVISIONS=[
  {value:'novice',label:'Novice',abbr:'N'},
  {value:'beginner',label:'Beginner',abbr:'B'},
  {value:'intermediate',label:'Intermediate',abbr:'I'},
  {value:'advanced',label:'Advanced',abbr:'A'},
  {value:'pro',label:'Pro',abbr:'P'}
];
function divisionMeta(value){
  return PLAYER_DIVISIONS.find(item=>item.value===value)||PLAYER_DIVISIONS[0];
}
function playerDivisionValue(player){
  return divisionMeta(player&&player.division).value;
}
function playerDivisionLabel(player){
  return divisionMeta(playerDivisionValue(player)).label;
}
function playerDivisionBadge(player){
  const meta=divisionMeta(playerDivisionValue(player));
  return `<span class="division-tag" title="${esc(meta.label)} division" aria-label="${esc(meta.label)} division">${esc(meta.abbr)}</span>`;
}
function playerRosterBadges(player){
  if(!player) return '';
  if(player.guest){
    const meta=divisionMeta(playerDivisionValue(player));
    return `<span class="guest-division-badges"><span class="guest-tag">Guest</span><span class="division-tag" title="${esc(meta.label)} division" aria-label="${esc(meta.label)} division">${esc(meta.abbr)}</span></span>`;
  }
  return playerDivisionBadge(player);
}
function normalizeEmail(value){
  return String(value||'').trim().toLowerCase();
}
function isValidEmail(value){
  return /^\S+@\S+\.\S+$/.test(String(value||'').trim());
}
function playerEmail(player){
  if(!player) return '';
  const direct=normalizeEmail(player.email||player.migrationEmail||player.pendingMigrationEmail||'');
  if(direct) return direct;
  const linked=(state.users||[]).find(user=>(user.playerId&&user.playerId===player.id)||(player.ownerUid&&user.uid===player.ownerUid));
  return normalizeEmail((linked&&linked.email)||(state.myPlayerId===player.id&&state.currentUser&&state.currentUser.email));
}
function canAdminViewPlayerPrivateMeta(player){
  if(!player||!state.currentUser) return false;
  return isSuperAdmin()||activePlayerClubIds(player).some(clubId=>isAdminForClub(clubId));
}
function renderPlayerPrivateMeta(player,options={}){
  if(!player) return '';
  const lines=[];
  const email=playerEmail(player);
  const playerCode=player.player_id||player.playerId||player.id||'';
  if(email&&canAdminViewPlayerPrivateMeta(player)) lines.push(`Email: ${esc(email)}`);
  if(options.includeId!==false&&playerCode) lines.push(`Player ID: ${esc(playerCode)}`);
  return lines.length?`<span class="player-private-meta">${lines.map(line=>`<span>${line}</span>`).join('')}</span>`:'';
}
function rosterPlayerNameHTML(player){
  const email=playerEmail(player);
  return `${esc(player.name)}${playerRosterBadges(player)}${email&&canAdminViewPlayerPrivateMeta(player)?`<span class="roster-player-email">${esc(email)}</span>`:''}`;
}
const DIVISION_TIPS={
  novice:[
    ['Start with the serve','Land deep serves before adding pace so every point begins under control.'],
    ['Move after returns','Return deep, then move forward with your partner instead of admiring the shot.'],
    ['Aim through the middle','When rushed, hit through the middle to reduce errors and force communication.'],
    ['Keep your paddle ready','Hold the paddle out front near chest height so blocks feel simple.'],
    ['Choose safe targets','Use bigger court targets until you can place the ball consistently.'],
    ['Learn the score rhythm','Say the score before serving and reset your feet before every point.']
  ],
  beginner:[
    ['Return deep','A deep return buys time to reach the kitchen and keeps the serving team back.'],
    ['Control dink height','Practice soft cross-court dinks that clear the net by a small repeatable margin.'],
    ['Reset low balls','If the ball is below net height, reset softly instead of forcing a speed-up.'],
    ['Serve with shape','Use a smooth, repeatable swing and aim deep middle before chasing power.'],
    ['Split-step at contact','Pause your feet as the opponent hits so your first move is balanced.'],
    ['Communicate middle balls','Call mine, yours, or switch early so both players do not freeze.']
  ],
  intermediate:[
    ['Attack the right ball','Speed up balls that sit high. Let low balls stay soft and neutral.'],
    ['Protect your partner','Shift with the ball and cover middle when your partner is pulled wide.'],
    ['Vary placement','Mix body shots, feet, and open court targets so opponents cannot camp.'],
    ['Build with thirds','Use third-shot drops to earn the kitchen instead of rushing the fifth ball.'],
    ['Read paddle angles','Track the opponent paddle face to anticipate line, middle, or cross-court.'],
    ['Recover after attacks','After speeding up, expect the counter and keep your paddle compact.']
  ],
  advanced:[
    ['Disguise tempo','Show the same paddle prep for dink, roll, and speed-up to delay reactions.'],
    ['Win transition rallies','Reset from mid-court until you earn the kitchen line safely.'],
    ['Stack with purpose','Use positioning to put forehands in the middle and isolate weaker matchups.'],
    ['Pressure the feet','Aim drives and rolls at the opponent feet to create pop-ups.'],
    ['Change patterns late','Repeat a pattern until it works, then change only when balance shifts.'],
    ['Own the counter lane','Stay compact on speed-ups and counter through the safest open lane.']
  ],
  pro:[
    ['Pressure patterns','Build points around repeated pressure, then change direction when balance shifts.'],
    ['Counter first','Stay compact on speed-ups and make opponents prove they can beat your counters.'],
    ['Manage risk by score','Use bigger targets at neutral scores and tighter patterns on critical points.'],
    ['Manipulate court space','Use dinks and rolls to pull opponents off their preferred contact point.'],
    ['Win the first volley','Expect the fourth or sixth ball and take time away without over-swinging.'],
    ['Scout between rallies','Track which player handles pace, resets, and middle balls under stress.']
  ]
};
function divisionTips(player){
  const tips=DIVISION_TIPS[playerDivisionValue(player)]||DIVISION_TIPS.novice;
  const offset=(new Date().getDate()+tips.length)%tips.length;
  return [0,1,2,3,4,5].map(i=>tips[(offset+i)%tips.length]);
}
function setDivisionTipIndex(index,total){
  const count=Number(total)||1;
  state.divisionTipIndex=((Number(index)||0)%count+count)%count;
  render();
}
function shiftDivisionTip(delta,total){
  setDivisionTipIndex((Number(state.divisionTipIndex)||0)+(Number(delta)||0),total);
}
let divisionTipAutoTimer=null;
let divisionTipAutoPausedUntil=0;
function pauseDivisionTipAuto(ms){
  divisionTipAutoPausedUntil=Date.now()+(Number(ms)||0);
}
function scheduleDivisionTipAuto(total){
  clearTimeout(divisionTipAutoTimer);
  const count=Number(total)||0;
  if(count<2) return;
  const wait=Math.max(0,divisionTipAutoPausedUntil-Date.now())||4200;
  divisionTipAutoTimer=setTimeout(()=>{
    const slider=document.querySelector('.division-tip-slider');
    if(!slider) return;
    if(document.hidden){ scheduleDivisionTipAuto(count); return; }
    shiftDivisionTip(1,count);
  },wait);
}
function wireDivisionTipSlider(){
  const slider=document.querySelector('.division-tip-slider');
  if(!slider) return;
  const viewport=slider.querySelector('.division-tip-viewport');
  const total=Number(slider.dataset.totalTips)||0;
  if(!viewport||total<2){ scheduleDivisionTipAuto(total); return; }
  let startX=0;
  let startY=0;
  let tracking=false;
  viewport.addEventListener('pointerdown',event=>{
    tracking=true;
    startX=event.clientX;
    startY=event.clientY;
    viewport.classList.add('dragging');
    try{ viewport.setPointerCapture(event.pointerId); }catch(_){}
    pauseDivisionTipAuto(6500);
  });
  viewport.addEventListener('pointerup',event=>{
    if(!tracking) return;
    tracking=false;
    viewport.classList.remove('dragging');
    const deltaX=event.clientX-startX;
    const deltaY=event.clientY-startY;
    if(Math.abs(deltaX)>42&&Math.abs(deltaX)>Math.abs(deltaY)){
      shiftDivisionTip(deltaX<0?1:-1,total);
      return;
    }
    scheduleDivisionTipAuto(total);
  });
  viewport.addEventListener('pointercancel',()=>{
    tracking=false;
    viewport.classList.remove('dragging');
    scheduleDivisionTipAuto(total);
  });
  scheduleDivisionTipAuto(total);
}
function renderDivisionTips(player){
  const tips=divisionTips(player);
  const active=((Number(state.divisionTipIndex)||0)%tips.length+tips.length)%tips.length;
  return `<div class="division-tip-wrap"><div class="division-tip-slider" data-total-tips="${tips.length}" aria-label="${esc(playerDivisionLabel(player))} improvement tips">
    <div class="division-tip-head"><div class="eyebrow">Division tips</div></div>
    <div class="division-tip-viewport"><div class="division-tip-track" style="transform:translateX(-${active*100}%);">${tips.map(([title,copy],index)=>`<div class="division-tip" aria-hidden="${index===active?'false':'true'}"><strong>${esc(title)}</strong><span>${esc(copy)}</span></div>`).join('')}</div></div>
    <div class="division-tip-dots" aria-label="Division tip progress">${tips.map((_,index)=>`<span class="${index===active?'active':''}"></span>`).join('')}</div>
    <span class="division-tip-note">Tips like these can improve your gameplay, so give them a quick read.</span>
  </div></div>`;
}
function profileViewDay(){ return todayStr(); }
function profileViewId(playerId,uid,day){ return `${playerId}_${day}_${uid}`; }
function dailyVisitorCount(playerId){
  const day=profileViewDay();
  return state.profileViews.filter(view=>view.playerId===playerId&&view.day===day).length;
}
async function recordProfileView(playerId){
  if(!state.currentUser||!playerId||state.myPlayerId===playerId) return;
  const day=profileViewDay();
  const id=profileViewId(playerId,state.currentUser.uid,day);
  if(state.profileViews.some(view=>view.id===id)) return;
  const record={id,playerId,viewerUid:state.currentUser.uid,day,viewedAt:new Date().toISOString()};
  state.profileViews=[...state.profileViews,record];
  try{ await PROFILE_VIEWS_COL.doc(id).set(record,{merge:true}); }
  catch(e){ console.error('Could not record profile view',e); }
  render();
}
function canViewPlayerProfile(player){
  if(!player) return false;
  if(!isSignedIn()) return false;
  if(isSuperAdmin()||state.myPlayerId===player.id||activePlayerClubIds(player).some(id=>isClubAdmin(id))) return true;
  const visibility=profileVisibilityValue(player);
  if(visibility==='public') return true;
  if(visibility==='club'){
    const viewer=state.players.find(p=>p.id===state.myPlayerId);
    const viewerClubs=new Set(activePlayerClubIds(viewer));
    return isSignedIn()&&activePlayerClubIds(player).some(id=>viewerClubs.has(id));
  }
  return false;
}
function openPlayerProfile(playerId,context){
  const player=state.players.find(p=>p.id===playerId);
  if(!isSignedIn()){
    toast('Sign in or register to view player stats');
    openAuthModal('login');
    return;
  }
  if(!canViewPlayerProfile(player)&&!managedInviteClubsForPlayer(player).length){
    toast(isSignedIn()?'This player keeps detailed stats private':'Sign in or register to view player stats');
    return;
  }
  if(state.playerModalId!==playerId) state.playerProfilePlanKey=null;
  state.playerModalId=playerId;
  state.playerModalContext=context||null;
  recordProfileView(playerId);
  render();
}
async function saveProfileVisibility(value){
  if(!state.currentUser||!state.myPlayerId||state.profileVisibilityBusy) return;
  const visibility=['public','club','private'].includes(value)?value:'public';
  state.profileVisibilityBusy=true; render();
  try{
    await PLAYERS_COL.doc(state.myPlayerId).update({profileVisibility:visibility,updatedAt:new Date().toISOString()});
    state.players=state.players.map(p=>p.id===state.myPlayerId?{...p,profileVisibility:visibility}:p);
    toast('Profile visibility updated');
  }catch(e){
    console.error(e);
    toast('Could not update profile visibility. Publish the included Firestore rules first.');
  }
  state.profileVisibilityBusy=false; render();
}
async function saveProfileDivision(value){
  if(!state.currentUser||!state.myPlayerId||state.profileDivisionBusy) return;
  const division=playerDivisionValue({division:value});
  state.profileDivisionBusy=true; render();
  try{
    await PLAYERS_COL.doc(state.myPlayerId).update({division,updatedAt:new Date().toISOString()});
    state.players=state.players.map(p=>p.id===state.myPlayerId?{...p,division}:p);
    toast('Division updated');
  }catch(e){
    console.error(e);
    toast('Could not update your division. Publish the included Firestore rules first.');
  }
  state.profileDivisionBusy=false; render();
}
function upsertClubMembershipLocal(record){
  const id=record.id||clubMembershipId(record.clubId,record.playerId);
  const next={...record,id};
  const index=state.clubMemberships.findIndex(m=>m.id===id||(m.clubId===record.clubId&&m.playerId===record.playerId));
  if(index>=0) state.clubMemberships=[...state.clubMemberships.slice(0,index),next,...state.clubMemberships.slice(index+1)];
  else state.clubMemberships=[...state.clubMemberships,next];
}
function notificationDocId(type,sourceId,playerId){
  return [type,sourceId,playerId].map(value=>encodeURIComponent(String(value||''))).join('__');
}
async function createPlayerNotifications({type,sourceId,clubId,playerIds,title,body,url,extra={}}){
  const recipients=[...new Set(playerIds||[])].filter(playerId=>!!state.players.find(p=>p.id===playerId));
  if(!recipients.length) return;
  const now=new Date().toISOString();
  const writeNotification=playerId=>{
    const id=notificationDocId(type,sourceId,playerId);
    const record={
      id,type,sourceId,clubId:clubId||'independent',
      recipientPlayerId:playerId,
      recipientUid:(state.players.find(p=>p.id===playerId)||{}).ownerUid||null,
      title,body,url:url||'./index.html',
      read:false,
      createdByUid:state.currentUser&&state.currentUser.uid,
      createdAt:now,
      updatedAt:now,
      ...extra
    };
    return {id,record};
  };
  try{
    if(typeof db.batch==='function'){
      const batch=db.batch();
      recipients.map(writeNotification).forEach(({id,record})=>{
        batch.set(NOTIFICATIONS_COL.doc(id),record,{merge:true});
      });
      await batch.commit();
    }else{
      await Promise.all(recipients.map(playerId=>{
        const {id,record}=writeNotification(playerId);
        return NOTIFICATIONS_COL.doc(id).set(record,{merge:true});
      }));
    }
  }catch(e){
    console.warn('Could not create notification records',e);
  }
}
async function createClubSystemChatMessages({type,sourceId,clubId,playerIds,text}){
  const club=clubById(clubId);
  if(!club||!state.currentUser||!state.myPlayerId) return;
  const recipients=[...new Set(playerIds||[])].filter(playerId=>!!state.players.find(p=>p.id===playerId));
  if(!recipients.length) return;
  const now=new Date().toISOString();
  const stableSource=String(sourceId||uid('club_notice')).replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,120);
  const id=`club_notice_${type||'system'}_${stableSource}`;
  const record={
    id,clubId,
    kind:'system',
    systemType:type,
    sourceId,
    senderUid:state.currentUser.uid,
    senderPlayerId:state.myPlayerId,
    senderName:club.name,
    text:String(text||'').slice(0,500),
    mentions:recipients,
    mentionRoles:[],
    createdAt:now,
    updatedAt:now
  };
  try{
    await CLUB_CHATS_COL.doc(id).set(record,{merge:true});
  }catch(e){ console.warn('Could not create club system chat messages',e); }
}
async function invitePlayerToClub(clubId,playerId){
  if(!canInvitePlayersToClub(clubId)){ toast('Only joined club members can invite players to this club'); return; }
  const club=clubById(clubId);
  const player=state.players.find(p=>p.id===playerId);
  if(!club||!player){ toast('Club or player profile not found'); return; }
  if(playerIsMemberOfClub(player,clubId)){ toast(`${player.name} is already a member of ${club.name}`); return; }
  const existing=clubMembershipRecord(clubId,playerId);
  if(existing&&existing.status==='pending'){
    toast(`${player.name} already requested to join ${club.name}. Review the request in Club Hub.`);
    return;
  }
  if(existing&&existing.status==='invited'){ toast(`An invitation to ${club.name} is already waiting for ${player.name}`); return; }
  const busyId=clubMembershipId(clubId,playerId);
  if(state.clubInviteBusyId) return;
  state.clubInviteBusyId=busyId; render();
  const now=new Date().toISOString();
  const record={id:busyId,clubId,playerId,status:'invited',invitedByUid:state.currentUser.uid,invitedAt:now,updatedAt:now};
  try{
    await CLUB_MEMBERSHIPS_COL.doc(busyId).set(record,{merge:true});
    upsertClubMembershipLocal({...existing,...record});
    await createPlayerNotifications({
      type:'club_invite',
      sourceId:busyId,
      clubId,
      playerIds:[playerId],
      title:`Invitation to ${club.name}`,
      body:`${currentCreatorName()} invited you to join ${club.name}.`,
      url:'./index.html#profile',
      extra:{invitedByName:currentCreatorName()}
    });
    await createClubSystemChatMessages({
      type:'club_invite',
      sourceId:busyId,
      clubId,
      playerIds:[playerId],
      text:`${club.name} invited you to join the club. Open My Profile to accept or decline the invitation.`
    });
    toast(`${player.name} invited to ${club.name}`);
  }catch(e){
    console.error(e);
    toast('Could not send the club invitation. Publish the updated Firestore rules first.');
  }
  state.clubInviteBusyId=null; render();
}
async function respondToClubInvite(clubId,accept){
  if(!state.currentUser||!state.myPlayerId||state.profileClubBusy) return;
  const invite=pendingClubInvite(clubId,state.myPlayerId);
  const club=clubById(clubId);
  if(!invite||!club){ toast('This invitation is no longer available'); render(); return; }
  state.profileClubBusy=true; render();
  const now=new Date().toISOString();
  const update=accept
    ? {status:'active',acceptedByUid:state.currentUser.uid,acceptedAt:now,joinedAt:invite.joinedAt||now,updatedAt:now}
    : {status:'removed',declinedByUid:state.currentUser.uid,declinedAt:now,removedAt:now,updatedAt:now};
  try{
    await CLUB_MEMBERSHIPS_COL.doc(invite.id||clubMembershipId(clubId,state.myPlayerId)).set(update,{merge:true});
    upsertClubMembershipLocal({...invite,...update});
    toast(accept?`You joined ${club.name}`:`Invitation from ${club.name} declined`);
  }catch(e){
    console.error(e);
    toast('Could not respond to the invitation. Publish the updated Firestore rules first.');
  }
  state.profileClubBusy=false; render();
}
async function requestClubJoin(clubId){
  if(!isSignedIn()){ openAuthModal('register'); return; }
  if(!state.myPlayerId){ toast('Link your player profile before requesting club membership'); return; }
  const club=clubById(clubId);
  const player=state.players.find(p=>p.id===state.myPlayerId);
  if(!club||!player){ toast('Club or player profile not found'); return; }
  if(playerIsMemberOfClub(player,clubId)){ toast(`You are already a member of ${club.name}`); return; }
  if(pendingClubInvite(clubId,state.myPlayerId)){ toast(`${club.name} has invited you. Accept or decline the invitation in My Profile.`); return; }
  if(pendingJoinRequest(clubId,state.myPlayerId)){ toast(`Your request to join ${club.name} is awaiting approval`); return; }
  const now=new Date().toISOString();
  const id=clubMembershipId(clubId,state.myPlayerId);
  const record={id,clubId,playerId:state.myPlayerId,status:'pending',requestedByUid:state.currentUser.uid,requestedAt:now,updatedAt:now};
  try{ await CLUB_MEMBERSHIPS_COL.doc(id).set(record,{merge:true}); }
  catch(e){ console.error(e); toast('Could not send the join request. Publish the updated Firestore rules first.'); return; }
  upsertClubMembershipLocal(record);
  toast(`Request sent to ${club.name} administrators`);
  render();
}
async function reviewClubJoinRequest(clubId,playerId,approve){
  if(!isAdminForClub(clubId)){ toast('Only this club administrator can review join requests'); return; }
  const requestRecord=pendingJoinRequest(clubId,playerId);
  const player=state.players.find(p=>p.id===playerId);
  if(!requestRecord||!player){ toast('This join request is no longer pending'); return; }
  const now=new Date().toISOString();
  const update=approve
    ? {status:'active',approvedByUid:state.currentUser.uid,approvedAt:now,joinedAt:requestRecord.joinedAt||now,updatedAt:now}
    : {status:'removed',declinedByUid:state.currentUser.uid,declinedAt:now,removedAt:now,updatedAt:now};
  try{ await CLUB_MEMBERSHIPS_COL.doc(requestRecord.id||clubMembershipId(clubId,playerId)).set(update,{merge:true}); }
  catch(e){ console.error(e); toast('Could not review this join request'); return; }
  upsertClubMembershipLocal({...requestRecord,...update});
  toast(approve?`${player.name} approved as a club member`:`${player.name}'s request declined`);
  render();
}
async function submitClubRegistration(ev){
  ev.preventDefault();
  if(!isSignedIn()){ openAuthModal('register'); return; }
  if(!state.myPlayerId){ toast('Link your player profile before registering a club'); return; }
  if(state.clubBusy) return;
  const nameEl=document.getElementById('newClubName');
  const originEl=document.getElementById('newClubOrigin');
  const name=nameEl?nameEl.value.trim():'';
  const origin=originEl?originEl.value.trim():'';
  if(name.length<2||name.length>80){ toast('Enter a club name between 2 and 80 characters'); return; }
  if(origin.length<5||origin.length>200){ toast('Enter the club complete origin or address'); return; }
  if(clubsForDisplay().some(c=>(c.name||'').trim().toLowerCase()===name.toLowerCase())){ toast('A club with this name is already listed'); return; }
  state.clubBusy=true; render();
  const clubId=uid('club');
  const now=new Date().toISOString();
  const club={id:clubId,name,origin,status:'active',createdByUid:state.currentUser.uid,createdByPlayerId:state.myPlayerId,createdAt:now,updatedAt:now};
  const adminId=clubAdminId(clubId,state.currentUser.uid);
  const admin={id:adminId,clubId,uid:state.currentUser.uid,playerId:state.myPlayerId,role:'club_admin',createdAt:now};
  const membershipId=clubMembershipId(clubId,state.myPlayerId);
  const membership={id:membershipId,clubId,playerId:state.myPlayerId,status:'active',addedByUid:state.currentUser.uid,joinedAt:now};
  const player=state.players.find(p=>p.id===state.myPlayerId);
  const clubIds=[...new Set([...playerClubIds(player),clubId])];
  try{
    if(typeof db.batch==='function'){
      const batch=db.batch();
      batch.set(CLUBS_COL.doc(clubId),club);
      batch.set(CLUB_ADMINS_COL.doc(adminId),admin);
      batch.set(CLUB_MEMBERSHIPS_COL.doc(membershipId),membership);
      batch.update(PLAYERS_COL.doc(state.myPlayerId),{clubIds,clubId:player.clubId||clubId,updatedAt:now});
      batch.set(USERS_COL.doc(state.currentUser.uid),{clubIds,clubId:state.currentUser.clubId||clubId,updatedAt:now},{merge:true});
      await batch.commit();
    }else{
      await CLUBS_COL.doc(clubId).set(club);
      await CLUB_ADMINS_COL.doc(adminId).set(admin);
      await CLUB_MEMBERSHIPS_COL.doc(membershipId).set(membership);
      await PLAYERS_COL.doc(state.myPlayerId).update({clubIds,clubId:player.clubId||clubId,updatedAt:now});
      await USERS_COL.doc(state.currentUser.uid).set({clubIds,clubId:state.currentUser.clubId||clubId,updatedAt:now},{merge:true});
    }
    state.clubs=[...state.clubs.filter(c=>(c.id||c.docId)!==clubId),club];
    state.clubRoles=[...state.clubRoles.filter(role=>role.id!==adminId),admin];
    state.adminClubIds=[...new Set([...state.adminClubIds,clubId])];
    upsertClubMembershipLocal(membership);
    state.players=state.players.map(p=>p.id===state.myPlayerId?{...p,clubIds,clubId:p.clubId||clubId}:p);
    state.currentUser={...state.currentUser,clubIds,clubId:state.currentUser.clubId||clubId};
    state.clubHubSelectedId=null;
    state.showClubRegistration=false;
    toast(`${name} registered - you are its Club Admin`);
  }catch(e){ console.error(e); toast('Could not register the club. Publish the included Firestore rules first.'); }
  state.clubBusy=false; render();
}
async function setMyClubMembership(clubId,active){
  if(!state.currentUser||!state.myPlayerId||state.profileClubBusy) return;
  const club=clubById(clubId);
  if(!club){ toast('Club not found'); return; }
  if(active){ await requestClubJoin(clubId); return; }
  if(!active&&isClubAdmin(clubId)){ toast('A Club Admin cannot leave until another administrator is assigned'); return; }
  const player=state.players.find(p=>p.id===state.myPlayerId);
  if(!player) return;
  state.profileClubBusy=true; render();
  const now=new Date().toISOString();
  const membershipId=clubMembershipId(clubId,state.myPlayerId);
  const membership={id:membershipId,clubId,playerId:state.myPlayerId,status:'removed',addedByUid:state.currentUser.uid,updatedAt:now,removedAt:now};
  const ids=new Set(playerClubIds(player));
  ids.delete(clubId);
  const clubIds=[...ids];
  const primaryClubId=clubIds.includes(player.clubId)?player.clubId:(clubIds[0]||null);
  try{
    if(typeof db.batch==='function'){
      const batch=db.batch();
      batch.set(CLUB_MEMBERSHIPS_COL.doc(membershipId),membership,{merge:true});
      batch.update(PLAYERS_COL.doc(state.myPlayerId),{clubIds,clubId:primaryClubId,updatedAt:now});
      batch.set(USERS_COL.doc(state.currentUser.uid),{clubIds,clubId:primaryClubId,updatedAt:now},{merge:true});
      await batch.commit();
    }else{
      await CLUB_MEMBERSHIPS_COL.doc(membershipId).set(membership,{merge:true});
      await PLAYERS_COL.doc(state.myPlayerId).update({clubIds,clubId:primaryClubId,updatedAt:now});
      await USERS_COL.doc(state.currentUser.uid).set({clubIds,clubId:primaryClubId,updatedAt:now},{merge:true});
    }
    upsertClubMembershipLocal(membership);
    state.players=state.players.map(p=>p.id===state.myPlayerId?{...p,clubIds,clubId:primaryClubId}:p);
    state.currentUser={...state.currentUser,clubIds,clubId:primaryClubId};
    toast(`Removed ${club.name} from your profile`);
  }catch(e){ console.error(e); toast('Could not update your clubs. Publish the included Firestore rules first.'); }
  state.profileClubBusy=false; render();
}
async function addExistingClubMember(clubId){
  if(!isAdminForClub(clubId)){ toast('Only this club administrator can add members'); return; }
  const select=document.getElementById('clubExistingPlayer');
  const playerId=select?select.value:'';
  const player=state.players.find(p=>p.id===playerId);
  if(!player){ toast('Choose a player first'); return; }
  const id=clubMembershipId(clubId,playerId);
  const record={id,clubId,playerId,status:'active',addedByUid:state.currentUser.uid,joinedAt:new Date().toISOString()};
  try{ await CLUB_MEMBERSHIPS_COL.doc(id).set(record,{merge:true}); }
  catch(e){ console.error(e); toast('Could not add this member'); return; }
  upsertClubMembershipLocal(record); toast(`${player.name} added to ${clubName(clubId)}`); render();
}
async function createClubMember(clubId){
  if(!isAdminForClub(clubId)){ toast('Only this club administrator can add members'); return; }
  const input=document.getElementById('clubNewMemberName');
  const name=input?input.value.trim():'';
  if(name.length<2){ toast('Enter the new member name'); return; }
  const duplicate=state.players.find(p=>p.name.trim().toLowerCase()===name.toLowerCase());
  if(duplicate&&!confirm(`A CourtRush player named ${duplicate.name} already exists. Create a separate profile with the same name?`)) return;
  const playerId=uid('pl');
  const now=new Date().toISOString();
  const player={id:playerId,player_id:playerId,name,guest:false,clubId,clubIds:[clubId],createdAt:now,createdByUid:state.currentUser.uid};
  const id=clubMembershipId(clubId,playerId);
  const membership={id,clubId,playerId,status:'active',addedByUid:state.currentUser.uid,joinedAt:now};
  try{
    if(typeof db.batch==='function'){
      const batch=db.batch(); batch.set(PLAYERS_COL.doc(playerId),player); batch.set(CLUB_MEMBERSHIPS_COL.doc(id),membership); await batch.commit();
    }else{ await PLAYERS_COL.doc(playerId).set(player); await CLUB_MEMBERSHIPS_COL.doc(id).set(membership); }
  }catch(e){ console.error(e); toast('Could not create this club member'); return; }
  state.players=[...state.players,player]; upsertClubMembershipLocal(membership); toast(`${name} added to ${clubName(clubId)}`); render();
}
async function removeClubMember(clubId,playerId){
  if(!isAdminForClub(clubId)){ toast('Only this club administrator can remove members'); return; }
  if(playerId===state.myPlayerId&&isClubAdmin(clubId)){ toast('Assign another Club Admin before removing your own membership'); return; }
  const player=state.players.find(p=>p.id===playerId);
  const memberRole=clubRoleRecord(clubId,playerId);
  if(memberRole&&memberRole.role==='club_admin'){ toast('The primary Club Admin cannot be removed from the club'); return; }
  if(!player||!confirm(`Remove ${player.name} from ${clubName(clubId)}? Their global profile and match history will remain.`)) return;
  const id=clubMembershipId(clubId,playerId);
  const record={id,clubId,playerId,status:'removed',removedByUid:state.currentUser.uid,removedAt:new Date().toISOString()};
  try{
    if(typeof db.batch==='function'&&memberRole){
      const batch=db.batch();
      batch.set(CLUB_MEMBERSHIPS_COL.doc(id),record,{merge:true});
      batch.delete(CLUB_ADMINS_COL.doc(memberRole.id||clubAdminId(clubId,memberRole.uid)));
      await batch.commit();
      state.clubRoles=state.clubRoles.filter(item=>item.id!==(memberRole.id||clubAdminId(clubId,memberRole.uid)));
    }else{
      await CLUB_MEMBERSHIPS_COL.doc(id).set(record,{merge:true});
      if(memberRole){
        await CLUB_ADMINS_COL.doc(memberRole.id||clubAdminId(clubId,memberRole.uid)).delete();
        state.clubRoles=state.clubRoles.filter(item=>item!==memberRole);
      }
    }
  }
  catch(e){ console.error(e); toast('Could not remove this member'); return; }
  upsertClubMembershipLocal(record); toast(`${player.name} removed from ${clubName(clubId)}`); render();
}
async function setClubMemberRole(clubId,playerId,role){
  if(!canAssignClubRoles(clubId)){ toast('Only the primary Club Admin can assign club roles'); return; }
  const nextRole=['co_admin','staff','member'].includes(role)?role:'member';
  const player=state.players.find(p=>p.id===playerId);
  if(!player||!playerIsMemberOfClub(player,clubId)){ toast('Choose an approved club member'); return; }
  const existing=clubRoleRecord(clubId,playerId);
  if(existing&&existing.role==='club_admin'&&!isSuperAdmin()){ toast('The primary Club Admin role cannot be changed here'); render(); return; }
  if(nextRole!=='member'&&!player.ownerUid){ toast(`${player.name} needs a signed-in CourtRush account before receiving a role`); render(); return; }
  const now=new Date().toISOString();
  try{
    if(nextRole==='member'){
      if(existing) await CLUB_ADMINS_COL.doc(existing.id||clubAdminId(clubId,existing.uid)).delete();
      state.clubRoles=state.clubRoles.filter(item=>item!==existing&&item.id!==(existing&&existing.id));
    }else{
      const id=clubAdminId(clubId,player.ownerUid);
      const record={id,clubId,uid:player.ownerUid,playerId,role:nextRole,assignedByUid:state.currentUser.uid,updatedAt:now,...(existing&&existing.createdAt?{createdAt:existing.createdAt}:{createdAt:now})};
      await CLUB_ADMINS_COL.doc(id).set(record,{merge:true});
      state.clubRoles=[...state.clubRoles.filter(item=>item.id!==id&&!(item.clubId===clubId&&item.playerId===playerId)),record];
    }
    toast(`${player.name} is now ${clubRoleLabel(nextRole)}`);
  }catch(e){ console.error(e); toast('Could not update this club role. Check Firestore rules and try again.'); }
  render();
}

const CHAT_BAD_WORDS=[
  /\bf+u+c+k+(?:e[dr]|i+n+g+)?\b/i,/\bs+h+i+t+(?:t+y|h+e+a+d+)?\b/i,/\bb+i+t+c+h+(?:e+s)?\b/i,
  /\ba+s+s+h+o+l+e+s?\b/i,/\bb+a+s+t+a+r+d+s?\b/i,/\bc+u+n+t+s?\b/i,/\bd+i+c+k+s?\b/i,
  /\bc+o+c+k+s?\b/i,/\bp+u+s+s+y+\b/i,/\bm+o+t+h+e+r+f+u+c+k+e+r+s?\b/i,/\bw+h+o+r+e+s?\b/i,/\bs+l+u+t+s?\b/i,
  /\bp+u+t+a+(?:n+g+)?(?:\s+i+n+a+)?\b/i,/\bg+a+g+o+s?\b/i,/\bt+a+n+g+a+s?\b/i,/\bb+o+b+o+s?\b/i,
  /\bu+l+o+l+s?\b/i,/\bt+a+r+a+n+t+a+d+o+s?\b/i,/\bl+e+c+h+e+\b/i,/\by+a+w+a+\b/i,/\bp+i+s+t+i+\b/i,/\bp+a+k+y+u+\b/i
];
const CHAT_ROLE_MENTIONS=[
  {key:'admin',token:'Admin',role:'club_admin',label:'Admins'},
  {key:'co_admin',token:'Co-Admin',role:'co_admin',label:'Co-Admins'},
  {key:'staff',token:'Staff',role:'staff',label:'Staff'}
];
function normalizedChatText(value){
  return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[@4]/g,'a').replace(/[3]/g,'e').replace(/[1!]/g,'i').replace(/[0]/g,'o').replace(/[5$]/g,'s').replace(/[7]/g,'t').replace(/[^a-z\s]/g,' ');
}
function containsChatProfanity(value){ const normalized=normalizedChatText(value); return CHAT_BAD_WORDS.some(pattern=>pattern.test(normalized)); }
function selectChatClub(clubId){ if(visibleChatClubIds().includes(clubId)){ state.chatClubId=clubId; markChatRead(clubId); render(); } }
function formatChatTime(value){
  const date=value&&typeof value.toDate==='function'?value.toDate():new Date(value||Date.now());
  return Number.isNaN(date.getTime())?'Just now':date.toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
}
function chatMentionContext(input){
  if(!input) return null;
  const caret=input.selectionStart==null?input.value.length:input.selectionStart;
  const before=input.value.slice(0,caret);
  const match=before.match(/(^|\s)@([^@\n]{0,60})$/);
  if(!match) return null;
  return {start:caret-match[0].length+match[1].length,caret,query:match[2].trim().toLowerCase()};
}
function chatMentionCandidates(query){
  const members=membersForClub(state.chatClubId);
  const roleTargets=CHAT_ROLE_MENTIONS.map(definition=>{
    const recipients=members.filter(player=>clubRoleForPlayer(state.chatClubId,player)===definition.role);
    return {kind:'role',key:`role:${definition.key}`,mention:definition.token,label:definition.label,recipients};
  }).filter(target=>target.recipients.length&&(!query||target.mention.toLowerCase().includes(query)||target.label.toLowerCase().includes(query)));
  const memberTargets=members.filter(player=>player.id!==state.myPlayerId&&(!query||player.name.toLowerCase().includes(query))).map(player=>({kind:'player',key:`player:${player.id}`,mention:player.name,player}));
  return [...roleTargets,...memberTargets].slice(0,8);
}
function chatMentionTargetByKey(key,clubId){
  if(String(key).startsWith('role:')){
    const definition=CHAT_ROLE_MENTIONS.find(item=>item.key===String(key).slice(5));
    if(!definition) return null;
    const recipients=membersForClub(clubId).filter(player=>clubRoleForPlayer(clubId,player)===definition.role);
    return recipients.length?{kind:'role',key,mention:definition.token,label:definition.label,recipients}:null;
  }
  const playerId=String(key).replace(/^player:/,'');
  const player=membersForClub(clubId).find(member=>member.id===playerId);
  return player?{kind:'player',key:`player:${player.id}`,mention:player.name,player}:null;
}
function closeChatMentionMenu(){
  const menu=document.getElementById('clubChatMentionMenu');
  if(menu){ menu.hidden=true; menu.innerHTML=''; }
  state.chatMentionIndex=0;
}
function updateChatMentionMenu(input){
  const menu=document.getElementById('clubChatMentionMenu');
  const context=chatMentionContext(input);
  if(!menu||!context){ closeChatMentionMenu(); return; }
  const candidates=chatMentionCandidates(context.query);
  if(!candidates.length){ closeChatMentionMenu(); return; }
  state.chatMentionIndex=Math.min(state.chatMentionIndex,candidates.length-1);
  menu.innerHTML=`<div class="mention-menu-head">Mention a member or role</div>${candidates.map((target,index)=>`<button class="mention-option ${index===state.chatMentionIndex?'active':''}" type="button" role="option" aria-selected="${index===state.chatMentionIndex?'true':'false'}" data-target-key="${esc(target.key)}" onmousedown="event.preventDefault();insertChatMention(${jsArg(target.key)})">${target.kind==='role'?'<span class="mention-role-avatar" aria-hidden="true">@</span>':avatarHTML(target.player,28)}<span class="mention-option-copy"><strong>@${esc(target.mention)}</strong><span>${target.kind==='role'?`${target.recipients.length} ${esc(target.label.toLowerCase())}`:esc(clubRoleLabel(clubRoleForPlayer(state.chatClubId,target.player)))}</span></span></button>`).join('')}`;
  menu.hidden=false;
}
function handleChatMessageInput(event){ state.chatMentionIndex=0; updateChatMentionMenu(event.currentTarget); }
function handleChatMentionKeydown(event){
  const menu=document.getElementById('clubChatMentionMenu');
  if(!menu||menu.hidden) return;
  const options=[...menu.querySelectorAll('.mention-option')];
  if(!options.length) return;
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
    event.preventDefault();
    state.chatMentionIndex=(state.chatMentionIndex+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;
    updateChatMentionMenu(event.currentTarget);
  }else if(event.key==='Enter'||event.key==='Tab'){
    event.preventDefault();
    insertChatMention(options[state.chatMentionIndex].dataset.targetKey);
  }else if(event.key==='Escape'){
    event.preventDefault(); closeChatMentionMenu();
  }
}
function insertChatMention(targetKey){
  const input=document.getElementById('clubChatMessage');
  const target=chatMentionTargetByKey(targetKey,state.chatClubId);
  const context=chatMentionContext(input);
  if(!input||!target||!context) return;
  const insertion=`@${target.mention} `;
  input.value=input.value.slice(0,context.start)+insertion+input.value.slice(context.caret);
  const caret=context.start+insertion.length;
  input.focus(); input.setSelectionRange(caret,caret); closeChatMentionMenu();
}
function extractChatMentions(text,clubId){
  return extractChatMentionData(text,clubId).mentions;
}
function extractChatMentionData(text,clubId){
  const members=membersForClub(clubId);
  const mentionedPlayers=members.filter(player=>{
    const escapedName=player.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    return new RegExp(`@${escapedName}(?=$|[\\s.,!?;:])`,'i').test(text);
  });
  const mentionedRoles=CHAT_ROLE_MENTIONS.filter(definition=>new RegExp(`@${definition.token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?=$|[\\s.,!?;:])`,'i').test(text));
  const roleRecipients=mentionedRoles.flatMap(definition=>members.filter(player=>clubRoleForPlayer(clubId,player)===definition.role));
  return {mentions:[...new Set([...mentionedPlayers,...roleRecipients].map(player=>player.id))],mentionRoles:mentionedRoles.map(definition=>definition.key)};
}
function formatChatMessageText(message){
  const mentionNames=(Array.isArray(message.mentions)?message.mentions:[]).map(playerName).filter(name=>name&&name!=='Former player').sort((a,b)=>b.length-a.length);
  const roleTokens=(Array.isArray(message.mentionRoles)?message.mentionRoles:[]).map(key=>CHAT_ROLE_MENTIONS.find(item=>item.key===key)).filter(Boolean).map(item=>item.token);
  const tokens=[...new Set([...mentionNames,...roleTokens])].sort((a,b)=>b.length-a.length).map(token=>`@${token}`);
  if(!tokens.length) return esc(message.text||'');
  const escapedTokens=tokens.map(token=>token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  const parts=String(message.text||'').split(new RegExp(`(${escapedTokens.join('|')})`,'gi'));
  return parts.map((part,index)=>index%2?`<span class="mention">${esc(part)}</span>`:esc(part)).join('');
}
async function sendClubChat(ev){
  ev.preventDefault();
  if(state.chatBusy||!state.currentUser||!state.myPlayerId) return;
  const clubId=state.chatClubId;
  if(!clubId||!chatClubIds().includes(clubId)){ toast('You can only message clubs you belong to or help manage'); return; }
  const input=document.getElementById('clubChatMessage');
  const message=input?input.value.trim():'';
  if(!message){ toast('Write a message first'); return; }
  if(message.length>500){ toast('Keep chat messages to 500 characters or fewer'); return; }
  if(containsChatProfanity(message)){ toast('Message not sent. Club Chat does not allow profanity or abusive words in English or Tagalog.'); return; }
  const id=uid('chat');
  const now=new Date().toISOString();
  const player=state.players.find(p=>p.id===state.myPlayerId);
  const mentionData=extractChatMentionData(message,clubId);
  const record={id,clubId,senderUid:state.currentUser.uid,senderPlayerId:state.myPlayerId,senderName:player?player.name:(state.currentUser.displayName||'Club member'),text:message,mentions:mentionData.mentions,mentionRoles:mentionData.mentionRoles,createdAt:now};
  state.chatBusy=true;
  try{
    await CLUB_CHATS_COL.doc(id).set(record);
    state.chatMessages=[...state.chatMessages.filter(item=>item.id!==id),record].sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
    if(input) input.value='';
  }catch(e){ console.error(e); toast('Could not send this message. Check your connection or Firestore rules.'); }
  state.chatBusy=false;
  render();
}
async function clearClubChatForAll(clubId){
  if(state.chatClearBusy||!state.currentUser||!canClearClubChat(clubId)){
    toast('Only this club Admin, Co-Admin, or Staff can clear the chat');
    return;
  }
  const club=clubById(clubId);
  if(!club){ toast('Club not found'); return; }
  if(!confirm(`Clear every message in ${club.name} Club Chat for all members? This cannot be undone.`)) return;
  state.chatClearBusy=true;
  render();
  try{
    const snap=await CLUB_CHATS_COL.where('clubId','==',clubId).get();
    const docs=snap.docs||[];
    for(let start=0;start<docs.length;start+=450){
      const batch=db.batch();
      docs.slice(start,start+450).forEach(doc=>batch.delete(doc.ref));
      await batch.commit();
    }
    state.chatMessages=state.chatMessages.filter(message=>message.clubId!==clubId);
    toast(docs.length?`Cleared ${docs.length} message${docs.length===1?'':'s'} for all ${club.name} members`:`${club.name} Club Chat is already empty`);
  }catch(e){
    console.error(e);
    toast('Could not clear this chat. Publish the updated Firestore rules and try again.');
  }
  state.chatClearBusy=false;
  render();
}

/* ============================= SITE SUPPORT ============================= */
function openSupportPanel(){ state.supportPanelOpen=true; render(); }
function closeSupportPanel(){ state.supportPanelOpen=false; render(); }
function supportCategoryLabel(value){
  return ({account:'Account',club:'Club management',game:'Game Plan or results',chat:'Club Chat',technical:'Technical issue',other:'Other'})[value]||'Support';
}
function supportOpenCount(){ return isSuperAdmin()?state.supportRequests.filter(request=>request.status!=='resolved').length:0; }
async function sendSupportRequest(event){
  event.preventDefault();
  if(state.supportBusy||!state.currentUser) return;
  const form=event.currentTarget;
  const category=(form.querySelector('[name="supportCategory"]')||{}).value||'other';
  const subject=((form.querySelector('[name="supportSubject"]')||{}).value||'').trim();
  const message=((form.querySelector('[name="supportMessage"]')||{}).value||'').trim();
  if(subject.length<3||subject.length>100){ toast('Add a short subject between 3 and 100 characters'); return; }
  if(message.length<10||message.length>1200){ toast('Describe the issue in 10 to 1,200 characters'); return; }
  const player=state.players.find(item=>item.id===state.myPlayerId);
  const id=uid('support');
  const record={id,reporterUid:state.currentUser.uid,reporterPlayerId:state.myPlayerId||null,reporterName:player?player.name:(state.currentUser.displayName||state.currentUser.email||'CourtRush user'),reporterEmail:state.currentUser.email||'',category,subject,message,status:'open',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  state.supportBusy=true; render();
  try{
    await SUPPORT_REQUESTS_COL.doc(id).set(record);
    state.supportRequests=[record,...state.supportRequests.filter(item=>item.id!==id)];
    toast('Support request sent to the site administrator');
  }catch(error){ console.error(error); toast('Could not send the support request. Check Firestore rules and try again.'); }
  state.supportBusy=false; render();
}
async function replySupportRequest(event,requestId){
  event.preventDefault();
  if(state.supportBusy||!isSuperAdmin()) return;
  const request=state.supportRequests.find(item=>item.id===requestId);
  const response=((event.currentTarget.querySelector('textarea')||{}).value||'').trim();
  if(!request){ toast('This support request is no longer available'); return; }
  if(response.length<2||response.length>1200){ toast('Write a response between 2 and 1,200 characters'); return; }
  const update={adminResponse:response,status:'resolved',respondedAt:new Date().toISOString(),respondedByUid:state.currentUser.uid,updatedAt:new Date().toISOString()};
  state.supportBusy=true; render();
  try{
    await SUPPORT_REQUESTS_COL.doc(requestId).set(update,{merge:true});
    state.supportRequests=state.supportRequests.map(item=>item.id===requestId?{...item,...update}:item);
    toast('Response sent and request marked resolved');
  }catch(error){ console.error(error); toast('Could not send the support response'); }
  state.supportBusy=false; render();
}
function renderSupportRequest(request,adminView){
  const resolved=request.status==='resolved';
  return `<article class="support-request"><div class="support-request-head"><div><strong>${esc(request.subject||supportCategoryLabel(request.category))}</strong><span>${adminView?`${esc(request.reporterName||'CourtRush user')} - `:''}${esc(supportCategoryLabel(request.category))} - ${esc(formatChatTime(request.createdAt))}</span></div><span class="support-status ${resolved?'resolved':''}">${resolved?'Resolved':'Open'}</span></div><p class="support-request-message">${esc(request.message||'')}</p>${request.adminResponse?`<div class="support-response"><strong>Site administrator response</strong><p>${esc(request.adminResponse)}</p></div>`:''}${adminView&&!resolved?`<form class="support-reply-form" onsubmit="replySupportRequest(event,${jsArg(request.id)})"><textarea maxlength="1200" rows="2" aria-label="Reply to ${esc(request.reporterName||'user')}" placeholder="Write a helpful response..." ${state.supportBusy?'disabled':''}></textarea><button class="btn btn-primary btn-sm" type="submit" ${state.supportBusy?'disabled':''}>Send &amp; resolve</button></form>`:''}</article>`;
}
function renderSupportButton(){
  const count=supportOpenCount();
  return `<button class="support-fab" type="button" onclick="openSupportPanel()" aria-label="Contact site administrator${count?`. ${count} open support request${count===1?'':'s'}`:''}"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 5.5A3.5 3.5 0 0 1 8 2h8a3.5 3.5 0 0 1 3.5 3.5v6A3.5 3.5 0 0 1 16 15h-5l-4.8 4.1c-.65.56-1.7.1-1.7-.76V15.4A3.5 3.5 0 0 1 2 12V5.5h2.5Z" fill="currentColor"/><circle cx="8" cy="8.5" r="1" fill="var(--ball-fill)"/><circle cx="12" cy="8.5" r="1" fill="var(--ball-fill)"/><circle cx="16" cy="8.5" r="1" fill="var(--ball-fill)"/></svg><span>Support</span>${count?`<span class="support-fab-badge">${count}</span>`:''}</button>`;
}
function renderSupportModal(){
  if(!state.currentUser) return `<div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="supportTitle" onclick="if(event.target===this)closeSupportPanel()"><div class="modal support-modal"><button class="modal-close" type="button" onclick="closeSupportPanel()" aria-label="Close support">&times;</button><div class="eyebrow">CourtRush support</div><h2 id="supportTitle">Contact the site administrator</h2><p class="support-intro">Sign in so the administrator can identify your account and follow up on your request.</p><button class="btn btn-ball" type="button" onclick="state.supportPanelOpen=false;openAuthModal('login')">Sign in to contact support</button></div></div>`;
  const adminView=isSuperAdmin();
  return `<div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="supportTitle" onclick="if(event.target===this)closeSupportPanel()"><div class="modal support-modal"><button class="modal-close" type="button" onclick="closeSupportPanel()" aria-label="Close support">&times;</button><div class="eyebrow">${adminView?'Site administration':'CourtRush support'}</div><h2 id="supportTitle">${adminView?'Support inbox':'Contact the site administrator'}</h2><p class="support-intro">${adminView?'Review user questions, send a response, and resolve completed requests.':'Describe what you need help with. Your request and the administrator response stay linked to your CourtRush account.'}</p>${adminView?'':`<form class="support-form" onsubmit="sendSupportRequest(event)"><div class="field-row"><div class="field"><label for="supportCategory">Topic</label><select id="supportCategory" name="supportCategory" ${state.supportBusy?'disabled':''}><option value="account">Account</option><option value="club">Club management</option><option value="game">Game Plan or results</option><option value="chat">Club Chat</option><option value="technical">Technical issue</option><option value="other">Other</option></select></div><div class="field"><label for="supportSubject">Subject</label><input id="supportSubject" name="supportSubject" type="text" maxlength="100" placeholder="Short summary" ${state.supportBusy?'disabled':''}/></div></div><div class="field"><label for="supportMessage">How can we help?</label><textarea id="supportMessage" name="supportMessage" maxlength="1200" rows="5" placeholder="Include what happened and what you expected..." ${state.supportBusy?'disabled':''}></textarea></div><button class="btn btn-primary" type="submit" ${state.supportBusy?'disabled':''}>${state.supportBusy?'Sending...':'Send support request'}</button></form>`}<div class="divider"></div><div class="section-title"><div><div class="eyebrow">${adminView?'Incoming requests':'Your requests'}</div><h2>${adminView?'Latest support messages':'Request history'}</h2></div><span class="diff-pill diff-zero">${state.supportRequests.length}</span></div>${state.supportRequests.length?`<div class="support-request-list">${state.supportRequests.map(request=>renderSupportRequest(request,adminView)).join('')}</div>`:`<div class="empty" style="padding:24px 10px;"><h3>${adminView?'Inbox clear':'No support requests yet'}</h3><p>${adminView?'New user requests will appear here.':'Use the form above whenever you need help.'}</p></div>`}</div></div>`;
}
async function saveClubDetails(ev,clubId){
  ev.preventDefault();
  if(!isAdminForClub(clubId)){ toast('Only this club administrator can edit club details'); return; }
  const club=clubById(clubId);
  if(!club||club.legacy){ toast('Create a registered club record before editing legacy details'); return; }
  const name=(document.getElementById('editClubName')||{}).value||'';
  const origin=(document.getElementById('editClubOrigin')||{}).value||'';
  const cleanName=name.trim(),cleanOrigin=origin.trim();
  if(cleanName.length<2||cleanName.length>80||cleanOrigin.length<5||cleanOrigin.length>200){ toast('Enter a valid club name and complete origin/address'); return; }
  const update={name:cleanName,origin:cleanOrigin,updatedAt:new Date().toISOString()};
  try{ await CLUBS_COL.doc(clubId).update(update); }
  catch(e){ console.error(e); toast('Could not update club details'); return; }
  state.clubs=state.clubs.map(c=>c.id===clubId?{...c,...update}:c); toast('Club details updated'); render();
}
async function completeLegacyClubRegistration(ev){
  ev.preventDefault();
  if(!isAdminForClub(ACTIVE_CLUB_ID)||!state.myPlayerId){ toast('Only the existing Rising Club Admin can complete this registration'); return; }
  const name=((document.getElementById('legacyClubName')||{}).value||'').trim();
  const origin=((document.getElementById('legacyClubOrigin')||{}).value||'').trim();
  if(name.length<2||name.length>80||origin.length<5||origin.length>200){ toast('Enter the club name and complete origin/address'); return; }
  const now=new Date().toISOString();
  const club={id:ACTIVE_CLUB_ID,name,origin,status:'active',createdByUid:state.currentUser.uid,createdByPlayerId:state.myPlayerId,createdAt:now,updatedAt:now};
  const adminId=clubAdminId(ACTIVE_CLUB_ID,state.currentUser.uid);
  const admin={id:adminId,clubId:ACTIVE_CLUB_ID,uid:state.currentUser.uid,playerId:state.myPlayerId,role:'club_admin',createdAt:now};
  const membershipId=clubMembershipId(ACTIVE_CLUB_ID,state.myPlayerId);
  const membership={id:membershipId,clubId:ACTIVE_CLUB_ID,playerId:state.myPlayerId,status:'active',addedByUid:state.currentUser.uid,joinedAt:now};
  try{
    if(typeof db.batch==='function'){
      const batch=db.batch(); batch.set(CLUBS_COL.doc(ACTIVE_CLUB_ID),club); batch.set(CLUB_ADMINS_COL.doc(adminId),admin); batch.set(CLUB_MEMBERSHIPS_COL.doc(membershipId),membership,{merge:true}); await batch.commit();
    }else{ await CLUBS_COL.doc(ACTIVE_CLUB_ID).set(club); await CLUB_ADMINS_COL.doc(adminId).set(admin); await CLUB_MEMBERSHIPS_COL.doc(membershipId).set(membership,{merge:true}); }
  }catch(e){ console.error(e); toast('Could not complete the legacy club registration'); return; }
  state.clubs=[...state.clubs.filter(c=>c.id!==ACTIVE_CLUB_ID),club];
  state.clubRoles=[...state.clubRoles.filter(role=>role.id!==adminId),admin];
  state.adminClubIds=[...new Set([...state.adminClubIds,ACTIVE_CLUB_ID])];
  upsertClubMembershipLocal(membership);
  toast('Rising Club registration completed'); render();
}
async function removeClubFromHub(clubId){
  if(!isAdminForClub(clubId)){ toast('Only this club administrator can remove the club'); return; }
  if(state.clubBusy) return;
  const club=clubById(clubId);
  if(!club){ toast('Club not found'); return; }
  const memberCount=membersForClub(clubId).length;
  const gamePlanCount=state.schedules.filter(s=>(s.clubId||ACTIVE_CLUB_ID)===clubId).length;
  const gameCount=state.matches.filter(m=>(m.clubId||ACTIVE_CLUB_ID)===clubId).length;
  const warning=`Remove ${club.name} from Club Hub? It will no longer accept members or new Game Plans. ${memberCount} member profile${memberCount===1?'':'s'}, ${gamePlanCount} Game Plan${gamePlanCount===1?'':'s'}, and ${gameCount} recorded game${gameCount===1?'':'s'} will remain in historical records.`;
  if(!confirm(warning)) return;
  state.clubBusy=true; render();
  const now=new Date().toISOString();
  const archiveUpdate={status:'removed',removedAt:now,removedByUid:state.currentUser.uid,updatedAt:now};
  let archivedClub;
  try{
    if(club.legacy){
      archivedClub={id:clubId,name:club.name,origin:club.origin||'Origin address pending migration',status:'removed',createdByUid:state.currentUser.uid,createdByPlayerId:state.myPlayerId||(state.currentUser&&state.currentUser.playerId)||null,createdAt:now,...archiveUpdate};
      await CLUBS_COL.doc(clubId).set(archivedClub,{merge:true});
    }else{
      archivedClub={...club,...archiveUpdate,legacy:false};
      await CLUBS_COL.doc(clubId).update(archiveUpdate);
    }
  }catch(e){
    console.error(e);
    state.clubBusy=false; render();
    toast('Could not remove the club. Check the included Firestore rules and try again.');
    return;
  }
  state.clubs=[...state.clubs.filter(c=>(c.id||c.docId)!==clubId),archivedClub];
  state.clubHubSelectedId=null;
  state.clubBusy=false;
  toast(`${club.name} removed from Club Hub. Historical records were kept.`);
  render();
}
async function addPlayer(name, guest, clubId, division){
  name = name.trim();
  if(!name) return null;
  const targetClubId=clubId||ACTIVE_CLUB_ID;
  const playerId=uid('pl');
  const p = { id: playerId, player_id:playerId, name, guest: !!guest, division:playerDivisionValue({division}), clubId:targetClubId==='independent'?null:targetClubId, clubIds:targetClubId==='independent'?[]:[targetClubId], createdAt: new Date().toISOString() };
  if(guest && state.currentUser) p.createdByUid = state.currentUser.uid;
  try{ await PLAYERS_COL.doc(p.id).set(p); }
  catch(e){ toast('Could not save - check your connection'); return null; }
  return p;
}
async function deletePlayer(id){
  if(!isSuperAdmin()){ toast('Only a platform administrator can delete a global player profile. Club Admins remove club memberships from Club Hub.'); return; }
  if(!confirm('Remove this player from Club Members? Past match history stays intact.')) return;
  try{ await PLAYERS_COL.doc(id).delete(); }
  catch(e){ toast('Could not remove - try again'); return; }
  state.playerModalId = null;
  render();
  toast('Player removed');
}
function replacePlayerIdList(list,fromId,toId){
  return [...new Set((list||[]).map(id=>id===fromId?toId:id))];
}
function replacePlayerIdInRounds(rounds,fromId,toId){
  return (rounds||[]).map(rd=>({
    ...rd,
    sitOuts:replacePlayerIdList(rd.sitOuts,fromId,toId),
    courts:(rd.courts||[]).map(ct=>({
      ...ct,
      team1:replacePlayerIdList(ct.team1,fromId,toId),
      team2:replacePlayerIdList(ct.team2,fromId,toId)
    }))
  }));
}
async function migrateGuestToRegisteredPlayer(guestId){
  if(!isSuperAdmin()){ toast('Only a platform administrator can migrate guest history'); return; }
  const guest=state.players.find(p=>p.id===guestId&&p.guest);
  if(!guest){ toast('Choose a guest player to migrate'); return; }
  const email=normalizeEmail(prompt(`Enter the player's email address to connect ${guest.name}'s guest history to:`)||'');
  if(!email){ toast('Migration cancelled'); return; }
  if(!isValidEmail(email)){ toast('Enter a valid email address'); return; }
  const now=new Date().toISOString();
  let linkedUser=null;
  try{
    const userSnap=await USERS_COL.where('email','==',email).limit(1).get();
    linkedUser=userSnap.empty?null:{uid:userSnap.docs[0].id,...userSnap.docs[0].data()};
  }catch(e){
    console.warn('Could not look up user email during migration',e);
  }
  let target=linkedUser&&linkedUser.playerId?state.players.find(p=>p.id===linkedUser.playerId):null;
  if(target&&target.id===guestId) target=null;
  if(target&&!confirm(`Move all games and Game Plan slots from guest ${guest.name} to ${target.name} (${email}), then remove the guest profile?`)) return;
  if(!target&&!confirm(`Connect ${guest.name}'s guest profile to ${email}? Future sign-ins with that email will use this player history.`)) return;
  const affectedMatches=target?state.matches.filter(m=>[...(m.team1||[]),...(m.team2||[])].includes(guestId)):[];
  const affectedSchedules=target?state.schedules.filter(s=>schedulePlayers(s).includes(guestId)):[];
  const targetId=target?target.id:guestId;
  const targetUpdate={
    guest:false,
    email,
    migrationEmail:email,
    pendingMigrationEmail:email,
    updatedAt:now
  };
  if(linkedUser&&linkedUser.uid) targetUpdate.ownerUid=linkedUser.uid;
  if(target){
    targetUpdate.migratedGuestIds=[...new Set([...(target.migratedGuestIds||[]),guestId])];
    targetUpdate.migratedGuestNames=[...new Set([...(target.migratedGuestNames||[]),guest.name])];
    if(!target.division&&guest.division) targetUpdate.division=guest.division;
  }
  try{
    if(typeof db.batch==='function'){
      const batch=db.batch();
      affectedMatches.forEach(m=>batch.set(MATCHES_COL.doc(m.id),{team1:replacePlayerIdList(m.team1,guestId,targetId),team2:replacePlayerIdList(m.team2,guestId,targetId),updatedAt:now,migratedGuestId:guestId,migratedToPlayerId:targetId},{merge:true}));
      affectedSchedules.forEach(s=>batch.set(SCHEDULES_COL.doc(scheduleDocId(s)),{selectedPlayerIds:replacePlayerIdList(schedulePlayers(s),guestId,targetId),rounds:replacePlayerIdInRounds(s.rounds,guestId,targetId),updatedAt:now,migratedGuestId:guestId,migratedToPlayerId:targetId},{merge:true}));
      batch.set(PLAYERS_COL.doc(targetId),targetUpdate,{merge:true});
      if(linkedUser&&linkedUser.uid) batch.set(USERS_COL.doc(linkedUser.uid),{playerId:targetId,email,updatedAt:now},{merge:true});
      if(target) batch.delete(PLAYERS_COL.doc(guestId));
      await batch.commit();
    }else{
      await Promise.all([
        ...affectedMatches.map(m=>MATCHES_COL.doc(m.id).set({team1:replacePlayerIdList(m.team1,guestId,targetId),team2:replacePlayerIdList(m.team2,guestId,targetId),updatedAt:now,migratedGuestId:guestId,migratedToPlayerId:targetId},{merge:true})),
        ...affectedSchedules.map(s=>SCHEDULES_COL.doc(scheduleDocId(s)).set({selectedPlayerIds:replacePlayerIdList(schedulePlayers(s),guestId,targetId),rounds:replacePlayerIdInRounds(s.rounds,guestId,targetId),updatedAt:now,migratedGuestId:guestId,migratedToPlayerId:targetId},{merge:true})),
        PLAYERS_COL.doc(targetId).set(targetUpdate,{merge:true}),
        ...(linkedUser&&linkedUser.uid?[USERS_COL.doc(linkedUser.uid).set({playerId:targetId,email,updatedAt:now},{merge:true})]:[]),
        ...(target?[PLAYERS_COL.doc(guestId).delete()]:[])
      ]);
    }
  }catch(e){ console.error(e); toast('Could not migrate guest history'); return; }
  state.matches=state.matches.map(m=>affectedMatches.some(x=>x.id===m.id)?{...m,team1:replacePlayerIdList(m.team1,guestId,targetId),team2:replacePlayerIdList(m.team2,guestId,targetId),updatedAt:now}:m);
  state.schedules=state.schedules.map(s=>affectedSchedules.some(x=>scheduleDocId(x)===scheduleDocId(s))?normalizeScheduleDoc(scheduleDocId(s),{...stripScheduleMeta(s),selectedPlayerIds:replacePlayerIdList(schedulePlayers(s),guestId,targetId),rounds:replacePlayerIdInRounds(s.rounds,guestId,targetId),updatedAt:now}):s);
  state.players=state.players.filter(p=>!target||p.id!==guestId).map(p=>p.id===targetId?{...p,...targetUpdate}:p);
  state.playerModalId=null;
  render();
  toast(target?`Guest history migrated to ${target.name}`:`${guest.name} is ready for ${email}`);
}
async function submitAddPlayerForm(ev){
  ev.preventDefault();
  if(!isSuperAdmin()){ toast('Use Club Hub to add a member inside your club'); return; }
  const name = document.getElementById('newPlayerName').value;
  if(!name.trim()){ toast('Enter a name first'); return; }
  const p = await addPlayer(name, false);
  if(!p) return;
  state.showAddPlayer = false;
  render();
  toast('Player added to Club Members');
}
async function deleteMatch(id){
  const match=state.matches.find(m=>m.id===id);
  if(!match||!isAdminForClub(match.clubId||ACTIVE_CLUB_ID)){ toast('Only this match Club Admin can delete it'); return; }
  if(!confirm("Delete this match record? This can't be undone.")) return;
  try{ await MATCHES_COL.doc(id).delete(); }
  catch(e){ toast('Could not delete - try again'); return; }
  toast('Match deleted');
}
function defaultScheduleDraft(){
  return {
    title:'',
    venueName:'',
    clubId:myClubIds()[0]||'independent',
    date:todayStr(),
    startTime:'18:00',
    mode:'open',
    format:'doubles',
    courts:Math.max(1,Math.floor(state.players.length/4)||1),
    durationMinutes:120,
    avgGameMinutes:15,
    status:'published',
    duprT1a:'', duprT1b:'', duprT2a:'', duprT2b:''
  };
}
function setScheduleFilter(filter){
  const allowed=['today','upcoming','dates','mine'];
  state.scheduleFilter=allowed.includes(filter)?filter:'today';
  if(state.scheduleFilter==='dates'&&state.dateRange!=='custom'){
    state.customDateStart=todayStr();
    state.customDateEnd=todayStr();
    state.dateRange='custom';
  }else if(state.scheduleFilter!=='dates'){
    state.customDateStart='';
    state.customDateEnd='';
    state.dateRange='overall';
  }
  state.scheduleCourtFilter='all';
  state.scheduleScreen='list';
  state.activeScheduleId=null;
  state.activeCourtFilter='all';
  state.editingResultId=null;
  state.lateResultKey=null;
  refreshScheduleSync();
  render();
}
function setScheduleCourtFilter(value){ state.scheduleCourtFilter=value||'all'; render(); }
function setActiveCourtFilter(value){ state.activeCourtFilter=value||'all'; render(); }
function backToScheduleList(){
  state.scheduleScreen='list';
  state.activeScheduleId=null;
  state.scheduleLeaderboardOpenId=null;
  state.activeCourtFilter='all';
  state.editingResultId=null;
  state.lateResultKey=null;
  state.scheduleDraft=null;
  state.scheduleSelection=new Set();
  state.scheduleGuestSearch='';
  state.scheduleGuestSearchOpen=false;
  state.tournamentTeams=null;
  state.tournamentLeftover=null;
  render();
}
function openCreateGamePlan(){
  if(!isSignedIn()){ openAuthModal('login'); return; }
  state.scheduleDraft=defaultScheduleDraft();
  state.scheduleSelection=new Set();
  state.scheduleGuestSearch='';
  state.scheduleGuestSearchOpen=false;
  state.tournamentTeams=null;
  state.tournamentLeftover=null;
  state.activeScheduleId=null;
  state.scheduleLeaderboardOpenId=null;
  state.activeCourtFilter='all';
  state.editingResultId=null;
  state.lateResultKey=null;
  state.scheduleScreen='create';
  render();
}
function openGamePlan(id){
  const sch=scheduleById(id);
  if(!sch){ toast('Game Plan could not be found'); return; }
  state.activeScheduleId=scheduleDocId(sch);
  state.scheduleLeaderboardOpenId=null;
  state.activeCourtFilter='all';
  state.editingResultId=null;
  state.lateResultKey=null;
  state.scheduleScreen='view';
  render();
}
function editGamePlan(id){
  const sch=scheduleById(id);
  if(!sch){ toast('Game Plan could not be found'); return; }
  if(!canManageSchedule(sch)){ toast('Only the Game Plan owner or an admin can edit it'); return; }
  if(isScheduleClosed(sch)){ toast('Ended or cancelled Game Plans are locked; saved results can still be corrected from View'); return; }
  const firstCourt = sch.rounds && sch.rounds[0] && sch.rounds[0].courts && sch.rounds[0].courts[0];
  state.scheduleDraft={
    title:sch.title||'',
    venueName:sch.venueName||'',
    clubId:sch.clubId||ACTIVE_CLUB_ID,
    date:sch.date||todayStr(),
    startTime:sch.startTime||'18:00',
    mode:sch.mode||'open',
    format:sch.format||'doubles',
    courts:Math.max(1,Number(sch.courts)||1),
    durationMinutes:Math.max(1,Number(sch.durationMinutes)||120),
    avgGameMinutes:Math.max(1,Number(sch.avgGameMinutes)||15),
    status:sch.status||'published',
    duprT1a:firstCourt&&firstCourt.team1 ? firstCourt.team1[0]||'' : '',
    duprT1b:firstCourt&&firstCourt.team1 ? firstCourt.team1[1]||'' : '',
    duprT2a:firstCourt&&firstCourt.team2 ? firstCourt.team2[0]||'' : '',
    duprT2b:firstCourt&&firstCourt.team2 ? firstCourt.team2[1]||'' : ''
  };
  state.scheduleSelection=new Set(schedulePlayers(sch));
  state.scheduleGuestSearch='';
  state.scheduleGuestSearchOpen=false;
  state.tournamentTeams=Array.isArray(sch.teams) ? sch.teams.map(t=>[...t]) : null;
  state.tournamentLeftover=sch.leftover||null;
  state.activeScheduleId=scheduleDocId(sch);
  state.scheduleLeaderboardOpenId=null;
  state.editingResultId=null;
  state.lateResultKey=null;
  state.scheduleScreen='edit';
  render();
}
function updateScheduleDraft(field, value, rerender){
  if(!state.scheduleDraft) state.scheduleDraft=defaultScheduleDraft();
  if(['courts','durationMinutes','avgGameMinutes'].includes(field)) value=Math.max(1,parseInt(value,10)||1);
  state.scheduleDraft[field]=value;
  if(field==='mode'){
    state.tournamentTeams=null;
    state.tournamentLeftover=null;
  }
  if(field==='clubId'){
    state.scheduleSelection=new Set();
    state.scheduleGuestSearch='';
    state.scheduleGuestSearchOpen=false;
    state.tournamentTeams=null;
    state.tournamentLeftover=null;
  }
  if(field==='format'){
    state.tournamentTeams=null;
    state.tournamentLeftover=null;
    if(value==='singles'){
      state.scheduleDraft.duprT1b='';
      state.scheduleDraft.duprT2b='';
    }
  }
  if(rerender!==false) render();
}
function toggleScheduleSelect(id){
  if(state.scheduleSelection.has(id)) state.scheduleSelection.delete(id);
  else state.scheduleSelection.add(id);
  if(state.scheduleDraft && state.scheduleDraft.mode==='tournament'){
    state.tournamentTeams=null;
    state.tournamentLeftover=null;
  }
  render();
}
async function transferPrimaryClubAdmin(clubId,playerId){
  if(!canTransferPrimaryClubAdmin(clubId)){ toast('Only the current Club Admin can transfer this role'); return; }
  const nextPlayer=state.players.find(p=>p.id===playerId);
  if(!nextPlayer||!playerIsMemberOfClub(nextPlayer,clubId)){ toast('Choose an approved club member'); return; }
  if(!nextPlayer.ownerUid){ toast(`${nextPlayer.name} needs a signed-in CourtRush account before becoming Club Admin`); return; }
  const current=state.clubRoles.find(role=>role.clubId===clubId&&role.role==='club_admin');
  if(current&&current.playerId===playerId){ toast(`${nextPlayer.name} is already the Club Admin`); return; }
  if(!confirm(`Transfer primary Club Admin of ${clubName(clubId)} to ${nextPlayer.name}? You will become a Co-Admin and can leave the club afterward.`)) return;
  const now=new Date().toISOString();
  const nextId=clubAdminId(clubId,nextPlayer.ownerUid);
  const nextRecord={id:nextId,clubId,uid:nextPlayer.ownerUid,playerId:nextPlayer.id,role:'club_admin',assignedByUid:state.currentUser.uid,createdAt:(current&&current.createdAt)||now,updatedAt:now};
  const previousPlayer=state.players.find(p=>p.id===(current&&current.playerId))||state.players.find(p=>p.ownerUid===state.currentUser.uid);
  const previousUid=(current&&current.uid)||(previousPlayer&&previousPlayer.ownerUid)||(state.currentUser&&state.currentUser.uid);
  const previousPlayerId=(current&&current.playerId)||(previousPlayer&&previousPlayer.id)||state.myPlayerId;
  const previousId=clubAdminId(clubId,previousUid);
  const previousRecord=previousUid&&previousPlayerId?{id:previousId,clubId,uid:previousUid,playerId:previousPlayerId,role:'co_admin',assignedByUid:state.currentUser.uid,createdAt:now,updatedAt:now}:null;
  try{
    if(typeof db.batch==='function'){
      const batch=db.batch();
      if(current&&current.id&&current.id!==nextId&&current.id!==previousId) batch.delete(CLUB_ADMINS_COL.doc(current.id));
      if(previousRecord&&previousId!==nextId) batch.set(CLUB_ADMINS_COL.doc(previousId),previousRecord,{merge:true});
      batch.set(CLUB_ADMINS_COL.doc(nextId),nextRecord,{merge:true});
      await batch.commit();
    }else{
      if(current&&current.id&&current.id!==nextId&&current.id!==previousId) await CLUB_ADMINS_COL.doc(current.id).delete();
      if(previousRecord&&previousId!==nextId) await CLUB_ADMINS_COL.doc(previousId).set(previousRecord,{merge:true});
      await CLUB_ADMINS_COL.doc(nextId).set(nextRecord,{merge:true});
    }
    state.clubRoles=[
      ...state.clubRoles.filter(role=>!(role.clubId===clubId&&(role.role==='club_admin'||role.id===nextId||role.id===previousId))),
      ...(previousRecord&&previousId!==nextId?[previousRecord]:[]),
      nextRecord
    ];
    toast(`${nextPlayer.name} is now the Club Admin`);
  }catch(e){ console.error(e); toast('Could not transfer Club Admin. Check Firestore rules and try again.'); }
  render();
}
function scheduleBaseRoster(clubId){
  return [...(clubId&&clubId!=='independent'?membersForClub(clubId):state.players)].sort((a,b)=>a.name.localeCompare(b.name));
}
function scheduleExternalPlayerPool(clubId){
  if(!clubId||clubId==='independent') return [];
  return state.players
    .filter(player=>!playerIsMemberOfClub(player,clubId))
    .sort((a,b)=>a.name.localeCompare(b.name));
}
function normalizePlayerSearch(value){
  return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
}
function playerMatchesRegisteredSearch(player,query){
  if(!query) return false;
  const guestLabel=player&&player.guest?'guest':'';
  const haystack=normalizePlayerSearch(`${player&&player.name||''} ${guestLabel} ${activePlayerClubIds(player).map(clubName).join(' ')}`);
  return query.split(/\s+/).every(term=>haystack.includes(term));
}
function setScheduleRegisteredSearchOpen(open){
  state.scheduleGuestSearchOpen=!!open;
}
function setScheduleGuestSearch(value){
  state.scheduleGuestSearch=String(value||'').trimStart().slice(0,80);
}
function applyScheduleRegisteredSearch(input){
  const value=(input&&input.value?input.value:'').trimStart().slice(0,80);
  state.scheduleGuestSearch=value;
  state.scheduleGuestSearchOpen=true;
  if(input&&input.value!==value) input.value=value;
  const panel=input?input.closest('.guest-search-panel'):null;
  if(!panel) return;
  const query=normalizePlayerSearch(value);
  let visible=0;
  panel.querySelectorAll('.guest-search-option').forEach(option=>{
    const match=!!query&&(option.dataset.playerSearch||'').includes(query) || (!!query&&query.split(/\s+/).every(term=>(option.dataset.playerSearch||'').includes(term)));
    option.hidden=!match;
    if(match) visible++;
  });
  const hint=panel.querySelector('[data-guest-search-hint]');
  const empty=panel.querySelector('[data-guest-search-empty]');
  if(hint) hint.hidden=!!query;
  if(empty) empty.hidden=!query||visible>0;
}
function addRegisteredPlayerToSchedule(playerId){
  const player=state.players.find(p=>p.id===playerId);
  if(!player) return;
  state.scheduleSelection.add(playerId);
  state.scheduleGuestSearch='';
  state.scheduleGuestSearchOpen=false;
  if(state.scheduleDraft && state.scheduleDraft.mode==='tournament'){
    state.tournamentTeams=null;
    state.tournamentLeftover=null;
  }
  render();
}
function selectAllSchedulePlayers(){
  const clubId=state.scheduleDraft&&state.scheduleDraft.clubId;
  const source=scheduleBaseRoster(clubId);
  state.scheduleSelection=new Set(source.map(p=>p.id));
  state.tournamentTeams=null;
  state.tournamentLeftover=null;
  render();
}
function clearSchedulePlayers(){
  state.scheduleSelection.clear();
  state.tournamentTeams=null;
  state.tournamentLeftover=null;
  render();
}
async function addGuestForSchedule(){
  if(!isSignedIn()){ toast('Sign in to add a walk-in guest'); return; }
  const input=document.getElementById('guestQuickAdd');
  const divisionEl=document.getElementById('guestQuickDivision');
  const name=input ? input.value : '';
  if(!name.trim()) return;
  const p=await addPlayer(name,true,'independent',divisionEl&&divisionEl.value);
  if(p){
    if(!state.players.some(player=>player.id===p.id)) state.players=[...state.players,p];
    state.scheduleSelection.add(p.id);
  }
  render();
}
function emptyScheduleCounts(playerIds){
  const partnerCount={},opponentCount={},sitOutCount={},gameCount={};
  playerIds.forEach(id=>{ sitOutCount[id]=0; gameCount[id]=0; });
  playerIds.forEach(a=>playerIds.forEach(b=>{ if(a!==b){ partnerCount[pairKey(a,b)]=0; opponentCount[pairKey(a,b)]=0; } }));
  return {partnerCount,opponentCount,sitOutCount,gameCount};
}
function applyRoundToScheduleCounts(round,counts){
  const courts=round&&round.courts||[];
  courts.forEach(ct=>{
    const team1=ct.team1||[],team2=ct.team2||[];
    [...team1,...team2].forEach(id=>counts.gameCount[id]=(counts.gameCount[id]||0)+1);
    if(team1.length>1) counts.partnerCount[pairKey(team1[0],team1[1])] = (counts.partnerCount[pairKey(team1[0],team1[1])]||0)+1;
    if(team2.length>1) counts.partnerCount[pairKey(team2[0],team2[1])] = (counts.partnerCount[pairKey(team2[0],team2[1])]||0)+1;
    team1.forEach(a=>team2.forEach(b=>{ counts.opponentCount[pairKey(a,b)] = (counts.opponentCount[pairKey(a,b)]||0)+1; }));
  });
  (round&&round.sitOuts||[]).forEach(id=>{ counts.sitOutCount[id]=(counts.sitOutCount[id]||0)+1; });
}
function rebuildOpenScheduleAfterLateAdd(sch,nextPlayerIds){
  const oldRounds=Array.isArray(sch.rounds)?sch.rounds:[];
  const firstAffected=oldRounds.findIndex(rd=>(rd.courts||[]).some(ct=>!scheduleHasRecordedSlot(sch,rd.round,ct.court)));
  if(firstAffected<0) return oldRounds;
  const format=sch.format||'doubles';
  const capacityPerCourt=format==='singles'?2:4;
  const usableCourts=Math.max(1,Math.min(Math.max(1,Number(sch.courts)||1),Math.floor(nextPlayerIds.length/capacityPerCourt)));
  const capacity=usableCourts*capacityPerCourt;
  if(nextPlayerIds.length<capacityPerCourt) return null;
  const previousIds=schedulePlayers(sch);
  const priorityRank={};
  previousIds.forEach((id,index)=>{ priorityRank[id]=index; });
  nextPlayerIds.forEach((id,index)=>{ if(priorityRank[id]===undefined) priorityRank[id]=previousIds.length+index; });
  const counts=emptyScheduleCounts(nextPlayerIds);
  const nextRounds=[];
  oldRounds.forEach((rd,index)=>{
    if(index<firstAffected){
      nextRounds.push(rd);
      applyRoundToScheduleCounts(rd,counts);
      return;
    }
    const keptCourts=(rd.courts||[]).filter(ct=>scheduleHasRecordedSlot(sch,rd.round,ct.court));
    const openCourtNumbers=(rd.courts||[]).filter(ct=>!scheduleHasRecordedSlot(sch,rd.round,ct.court)).map(ct=>ct.court);
    const keptRound={...rd,courts:keptCourts,sitOuts:[]};
    applyRoundToScheduleCounts(keptRound,counts);
    const occupied=new Set(keptCourts.flatMap(ct=>[...(ct.team1||[]),...(ct.team2||[])]));
    const openCourts=Math.max(0,(rd.courts||[]).length-keptCourts.length);
    let rebuilt={sitOuts:[],courts:[]};
    if(openCourts>0){
      const available=nextPlayerIds.filter(id=>!occupied.has(id));
      const lateUsable=Math.max(0,Math.min(openCourts,Math.floor(available.length/capacityPerCourt)));
      if(lateUsable>0){
        const previous=nextRounds.length?playersInRound(nextRounds[nextRounds.length-1]):[];
        rebuilt=buildGreedyRound(available,lateUsable,lateUsable*capacityPerCourt,format,counts.partnerCount,counts.opponentCount,counts.sitOutCount,priorityRank,counts.gameCount,previous);
      }
    }
    const courts=[...keptCourts,...rebuilt.courts.map((ct,i)=>({...ct,court:openCourtNumbers[i]||ct.court}))].sort((a,b)=>Number(a.court)-Number(b.court));
    const playing=new Set(courts.flatMap(ct=>[...(ct.team1||[]),...(ct.team2||[])]));
    const sitOuts=nextPlayerIds.filter(id=>!playing.has(id));
    nextRounds.push({...rd,courts,sitOuts});
    applyRoundToScheduleCounts({courts:rebuilt.courts,sitOuts:[]},counts);
  });
  return nextRounds;
}
function rebuildOpenScheduleAfterPlayerRemoval(sch,removePlayerId){
  const nextPlayerIds=schedulePlayers(sch).filter(id=>id!==removePlayerId);
  const oldRounds=Array.isArray(sch.rounds)?sch.rounds:[];
  const firstAffected=oldRounds.findIndex(rd=>
    (rd.sitOuts||[]).includes(removePlayerId) ||
    (rd.courts||[]).some(ct=>!scheduleHasRecordedSlot(sch,rd.round,ct.court) && [...(ct.team1||[]),...(ct.team2||[])].includes(removePlayerId))
  );
  if(firstAffected<0) return null;
  const format=sch.format||'doubles';
  const capacityPerCourt=format==='singles'?2:4;
  if(nextPlayerIds.length<capacityPerCourt) return null;
  const priorityRank={};
  nextPlayerIds.forEach((id,index)=>{ priorityRank[id]=index; });
  const counts=emptyScheduleCounts(nextPlayerIds);
  const nextRounds=[];
  oldRounds.forEach((rd,index)=>{
    if(index<firstAffected){
      nextRounds.push(rd);
      applyRoundToScheduleCounts(rd,counts);
      return;
    }
    const keptCourts=(rd.courts||[]).filter(ct=>scheduleHasRecordedSlot(sch,rd.round,ct.court));
    const openCourtNumbers=(rd.courts||[]).filter(ct=>!scheduleHasRecordedSlot(sch,rd.round,ct.court)).map(ct=>ct.court);
    const keptRound={...rd,courts:keptCourts,sitOuts:(rd.sitOuts||[]).filter(id=>id!==removePlayerId)};
    applyRoundToScheduleCounts(keptRound,counts);
    const occupied=new Set(keptCourts.flatMap(ct=>[...(ct.team1||[]),...(ct.team2||[])]));
    const available=nextPlayerIds.filter(id=>!occupied.has(id));
    const openCourts=Math.max(0,(rd.courts||[]).length-keptCourts.length);
    const usable=Math.max(0,Math.min(openCourts,Math.floor(available.length/capacityPerCourt)));
    const rebuilt=usable>0
      ? buildGreedyRound(available,usable,usable*capacityPerCourt,format,counts.partnerCount,counts.opponentCount,counts.sitOutCount,priorityRank,counts.gameCount,nextRounds.length?playersInRound(nextRounds[nextRounds.length-1]):[])
      : {sitOuts:[],courts:[]};
    const courts=[...keptCourts,...rebuilt.courts.map((ct,i)=>({...ct,court:openCourtNumbers[i]||ct.court}))].sort((a,b)=>Number(a.court)-Number(b.court));
    const playing=new Set(courts.flatMap(ct=>[...(ct.team1||[]),...(ct.team2||[])]));
    const sitOuts=nextPlayerIds.filter(id=>!playing.has(id));
    nextRounds.push({...rd,courts,sitOuts});
    applyRoundToScheduleCounts({courts:rebuilt.courts,sitOuts:[]},counts);
  });
  return {rounds:nextRounds,nextPlayerIds};
}
async function addLatePlayerToSchedule(scheduleId){
  const sch=scheduleById(scheduleId);
  if(!sch||!canManageSchedule(sch)){ toast('Only the Game Plan owner or an admin can add players'); return; }
  if(isScheduleClosed(sch)){ toast('Ended or cancelled Game Plans cannot add players'); return; }
  if(sch.mode!=='open'){ toast('Late player rebalancing is available for Open Play Game Plans'); return; }
  const source=document.getElementById('lateSchedulePlayer');
  const guestInput=document.getElementById('lateGuestName');
  const divisionEl=document.getElementById('lateGuestDivision');
  let playerId=source&&source.value;
  if(!playerId){
    const name=guestInput?guestInput.value:'';
    if(!name.trim()){ toast('Choose a registered player or enter a walk-in guest'); return; }
    const p=await addPlayer(name,true,'independent',divisionEl&&divisionEl.value);
    if(!p) return;
    if(!state.players.some(player=>player.id===p.id)) state.players=[...state.players,p];
    playerId=p.id;
  }
  if(schedulePlayers(sch).includes(playerId)){ toast('This player is already in the Game Plan'); return; }
  const nextPlayerIds=[...new Set([...schedulePlayers(sch),playerId])];
  const rounds=rebuildOpenScheduleAfterLateAdd(sch,nextPlayerIds);
  if(!rounds){ toast('No upcoming games are available to rebalance'); return; }
  const hadUpcoming=(sch.rounds||[]).some(rd=>(rd.courts||[]).some(ct=>!scheduleHasRecordedSlot(sch,rd.round,ct.court)));
  const updated={...stripScheduleMeta(sch),selectedPlayerIds:nextPlayerIds,rounds,numberOfRounds:rounds.length,status:sch.status==='published'&&scheduleRecordedCount(sch)>0?'in_progress':sch.status,updatedAt:new Date().toISOString()};
  try{ await SCHEDULES_COL.doc(scheduleDocId(sch)).set(updated); }
  catch(e){ console.error(e); toast('Could not add this player to the Game Plan'); return; }
  upsertScheduleLocal(scheduleDocId(sch),updated);
  toast(hadUpcoming?'Player added - upcoming games were rebalanced':'Player added to queue');
  render();
}
async function removePlayerFromScheduleQueue(scheduleId,playerId){
  const sch=scheduleById(scheduleId);
  if(!sch||!canManageSchedule(sch)){ toast('Only the Game Plan owner or an admin can remove players'); return; }
  if(isScheduleClosed(sch)){ toast('Ended or cancelled Game Plans cannot remove players'); return; }
  if(sch.mode!=='open'){ toast('Player removal is available for Open Play Game Plans'); return; }
  if(!schedulePlayers(sch).includes(playerId)){ toast('This player is not in the Game Plan'); return; }
  if(!playerHasUnplayedScheduleSlot(sch,playerId)){ toast('This player has no remaining unplayed games'); return; }
  const name=playerName(playerId);
  const affected=playerUnplayedScheduleSlotCount(sch,playerId);
  if(!confirm(`Remove ${name} from ${affected} remaining unplayed game${affected===1?'':'s'} or queue slot${affected===1?'':'s'}? Saved results will stay unchanged.`)) return;
  const rebuilt=rebuildOpenScheduleAfterPlayerRemoval(sch,playerId);
  if(!rebuilt){ toast('Could not rebalance the remaining games after removal'); return; }
  const updated={...stripScheduleMeta(sch),selectedPlayerIds:rebuilt.nextPlayerIds,rounds:rebuilt.rounds,numberOfRounds:rebuilt.rounds.length,status:sch.status==='published'&&scheduleRecordedCount(sch)>0?'in_progress':sch.status,updatedAt:new Date().toISOString()};
  try{ await SCHEDULES_COL.doc(scheduleDocId(sch)).set(updated); }
  catch(e){ console.error(e); toast('Could not remove this player from the Game Plan'); return; }
  upsertScheduleLocal(scheduleDocId(sch),updated);
  toast(`${name} removed from remaining unplayed games`);
  render();
}
function autoPairTeams(){
  const ids=shuffle(Array.from(state.scheduleSelection));
  if(ids.length<4){ toast('Pick at least 4 players to form two teams'); return; }
  const teams=[];
  while(ids.length>=2){
    const a=ids.shift();
    ids.sort((x,y)=> openPlayPartnerScore([a,x],{}) - openPlayPartnerScore([a,y],{}));
    const b=ids.shift();
    teams.push([a,b]);
  }
  state.tournamentTeams=teams;
  state.tournamentLeftover=ids.length ? ids[0] : null;
  render();
}
function duprSelectedIds(draft){
  if(!draft) return [];
  const ids=draft.format==='singles'
    ? [draft.duprT1a,draft.duprT2a]
    : [draft.duprT1a,draft.duprT1b,draft.duprT2a,draft.duprT2b];
  return ids.filter(Boolean);
}
function sessionRoundTarget(draft){
  const duration=Math.max(1,Number(draft.durationMinutes)||120);
  const avg=Math.max(1,Number(draft.avgGameMinutes)||15);
  return Math.max(1,Math.floor(duration/avg));
}
function buildOpenRoundsForDraft(playerIds,draft){
  const target=sessionRoundTarget(draft);
  let rounds=generateSchedule({playerIds,courts:draft.courts,format:draft.format});
  if(rounds.length>target) return rounds.slice(0,target).map((r,i)=>({...r,round:i+1}));
  rounds=rounds.map((r,i)=>({...r,round:i+1}));
  while(rounds.length<target){
    const temp={rounds,courts:draft.courts,format:draft.format};
    const {playerIds:ids,partnerCount,opponentCount,sitOutCount}=deriveCountsFromSchedule(temp);
    const capacityPerCourt=draft.format==='singles'?2:4;
    const usableCourts=Math.max(1,Math.min(draft.courts,Math.floor(ids.length/capacityPerCourt)));
    const capacity=usableCourts*capacityPerCourt;
    const last=rounds.length?playersInRound(rounds[rounds.length-1]):[];
    const gameCount=deriveGameCountFromRounds(rounds,ids);
    const next=buildGreedyRound(ids,usableCourts,capacity,draft.format,partnerCount,opponentCount,sitOutCount,null,gameCount,last);
    rounds.push({round:rounds.length+1,sitOuts:next.sitOuts,courts:next.courts});
  }
  return rounds;
}
function buildTournamentRoundsFromTeams(teams,courts,leftover){
  if(!Array.isArray(teams)||teams.length<2) return [];
  const tokens=teams.map((_,i)=>`t${i}`);
  const byToken={}; teams.forEach((team,i)=>byToken[`t${i}`]=team);
  const allPlayerIds=teams.flat();
  const blocks=[];
  buildCircleRounds(tokens).forEach(pairRound=>{
    const matches=[];
    pairRound.forEach(([a,b])=>{
      if(isBye(a)&&isBye(b)) return;
      if(isBye(a)||isBye(b)) return;
      matches.push({team1:byToken[a],team2:byToken[b]});
    });
    for(let i=0;i<matches.length;i+=Math.max(1,courts)){
      const chunk=matches.slice(i,i+Math.max(1,courts));
      const playing=new Set(chunk.flatMap(m=>[...m.team1,...m.team2]));
      const sitOuts=allPlayerIds.filter(id=>!playing.has(id));
      if(leftover) sitOuts.push(leftover);
      blocks.push({
        round:blocks.length+1,
        sitOuts:[...new Set(sitOuts)],
        courts:chunk.map((m,idx)=>({court:idx+1,team1:m.team1,team2:m.team2}))
      });
    }
  });
  return blocks;
}
function buildTournamentForDraft(draft){
  if(draft.format==='singles'){
    const teams=Array.from(state.scheduleSelection).map(id=>[id]);
    return {rounds:buildTournamentRoundsFromTeams(teams,draft.courts,null),teams:null,leftover:null,selectedPlayerIds:teams.flat()};
  }
  const teams=state.tournamentTeams||[];
  return {rounds:buildTournamentRoundsFromTeams(teams,draft.courts,state.tournamentLeftover),teams,leftover:state.tournamentLeftover||null,selectedPlayerIds:teams.flat().concat(state.tournamentLeftover?[state.tournamentLeftover]:[])};
}
function buildDuprForDraft(draft){
  const team1=draft.format==='singles'?[draft.duprT1a]:[draft.duprT1a,draft.duprT1b];
  const team2=draft.format==='singles'?[draft.duprT2a]:[draft.duprT2a,draft.duprT2b];
  return {rounds:[{round:1,sitOuts:[],courts:[{court:1,team1,team2}]}],selectedPlayerIds:[...team1,...team2]};
}
function playersInRound(round){
  return Array.from(new Set(((round&&round.courts)||[]).flatMap(ct=>[...(ct.team1||[]),...(ct.team2||[])])));
}
function deriveGameCountFromRounds(rounds,playerIds){
  const counts={};
  (playerIds||[]).forEach(id=>counts[id]=0);
  (rounds||[]).forEach(rd=>{
    (rd.courts||[]).forEach(ct=>{
      [...(ct.team1||[]),...(ct.team2||[])].forEach(id=>counts[id]=(counts[id]||0)+1);
    });
  });
  return counts;
}
function scheduleStructureSignature({mode,format,courts,durationMinutes,avgGameMinutes,selectedPlayerIds,teams,rounds}){
  const effectiveCourts=mode==='dupr'?1:(Number(courts)||1);
  const duprGames=mode==='dupr'?(rounds||[]).flatMap(rd=>(rd.courts||[]).map(ct=>({
    team1:[...(ct.team1||[])],team2:[...(ct.team2||[])]
  }))):null;
  return JSON.stringify({
    mode,format,courts:effectiveCourts,
    timing:mode==='open'?[Math.max(1,Number(durationMinutes)||120),Math.max(1,Number(avgGameMinutes)||15)]:null,
    players:[...new Set(selectedPlayerIds||[])].sort(),
    teams:Array.isArray(teams)?teams.map(t=>[...t].sort()).sort((a,b)=>a.join('|').localeCompare(b.join('|'))):null,
    duprGames
  });
}
async function saveGamePlan(){
  if(!isSignedIn()){ toast('Sign in to create a Game Plan'); return; }
  if(!allowAction('save-game-plan',2000)) return;
  const draft=state.scheduleDraft||defaultScheduleDraft();
  if(!draft.date){ toast('Choose a game day'); return; }
  if(!draft.startTime){ toast('Choose a start time'); return; }

  let rounds=[],selectedPlayerIds=[],teams=null,leftover=null;
  if(draft.mode==='open'){
    selectedPlayerIds=Array.from(state.scheduleSelection);
    const min=draft.format==='singles'?2:4;
    if(selectedPlayerIds.length<min){ toast(`Pick at least ${min} players`); return; }
    const existingOpen=state.scheduleScreen==='edit' ? scheduleById(state.activeScheduleId) : null;
    rounds=existingOpen&&existingOpen.mode==='open'&&Array.isArray(existingOpen.rounds) ? existingOpen.rounds : [];
  } else if(draft.mode==='tournament'){
    if(draft.format==='singles' && state.scheduleSelection.size<2){ toast('Pick at least 2 players'); return; }
    if(draft.format==='doubles'){
      if(!state.tournamentTeams || state.tournamentTeams.length<2){ toast('Pair up at least two teams first'); return; }
      if(state.tournamentLeftover){ toast('Tournament doubles needs an even number of players'); return; }
    }
    const built=buildTournamentForDraft(draft);
    rounds=built.rounds; selectedPlayerIds=built.selectedPlayerIds; teams=built.teams; leftover=built.leftover;
  } else {
    const expected=draft.format==='singles'?2:4;
    const ids=duprSelectedIds(draft);
    if(ids.length!==expected){ toast('Pick every DUPR player'); return; }
    if(new Set(ids).size!==ids.length){ toast("A player can't be picked twice"); return; }
    const built=buildDuprForDraft(draft);
    rounds=built.rounds; selectedPlayerIds=built.selectedPlayerIds;
  }
  if(draft.mode!=='open'&&!rounds.length){ toast('Could not build this Game Plan'); return; }
  const existing=state.scheduleScreen==='edit' ? scheduleById(state.activeScheduleId) : null;
  if(existing && isScheduleClosed(existing)){ toast('Ended or cancelled Game Plans cannot be regenerated'); return; }
  if(draft.date<todayStr() && (!existing || existing.date!==draft.date)){
    toast('Choose today or a future date for a new or rescheduled Game Plan');
    return;
  }
  // A DUPR plan may contain several manually appended matches. Editing the first
  // matchup or metadata must not silently discard the remaining courts.
  if(existing && existing.mode==='dupr' && draft.mode==='dupr' && existing.format===draft.format){
    const existingRound=(existing.rounds&&existing.rounds[0])||{round:1,sitOuts:[],courts:[]};
    const nextFirst=rounds[0].courts[0];
    const remaining=(existingRound.courts||[]).slice(1);
    rounds=[{...existingRound,round:1,courts:[nextFirst,...remaining]}];
    selectedPlayerIds=schedulePlayers({rounds});
  }
  if(existing && !canManageSchedule(existing)){ toast('Only the owner or an admin can save these changes'); return; }
  const effectiveCourts=draft.mode==='dupr'?1:Math.max(1,Number(draft.courts)||1);
  const nextSignature=scheduleStructureSignature({mode:draft.mode,format:draft.format,courts:effectiveCourts,durationMinutes:draft.durationMinutes,avgGameMinutes:draft.avgGameMinutes,selectedPlayerIds,teams,rounds});
  const oldSignature=existing ? scheduleStructureSignature({mode:existing.mode,format:existing.format,courts:existing.courts,durationMinutes:existing.durationMinutes,avgGameMinutes:existing.avgGameMinutes,selectedPlayerIds:schedulePlayers(existing),teams:existing.teams,rounds:existing.rounds}) : null;
  const structureChanged=!existing || nextSignature!==oldSignature;
  const dateChanged=!!(existing && existing.date!==draft.date);
  const hasRecorded=!!(existing && Object.keys(existing.recorded||{}).length);
  if(existing && hasRecorded && (structureChanged||dateChanged)){
    if(!confirm('This Game Plan already has recorded results. Saving structural or date changes will keep official match records in History, but disconnect the old Saved badges from this plan. Continue?')) return;
  }

  const docRef=existing ? SCHEDULES_COL.doc(scheduleDocId(existing)) : SCHEDULES_COL.doc();
  const now=new Date().toISOString();
  const preserveRounds=!!(existing && !structureChanged);
  const data={
    id:existing ? (existing.id||docRef.id) : docRef.id,
    title:String(draft.title||'').trim(),
    venueName:String(draft.venueName||'').trim().slice(0,120),
    date:draft.date,
    startTime:draft.startTime,
    mode:draft.mode,
    format:draft.format,
    courts:effectiveCourts,
    durationMinutes:Math.max(1,Number(draft.durationMinutes)||120),
    avgGameMinutes:Math.max(1,Number(draft.avgGameMinutes)||15),
    selectedPlayerIds:[...new Set(selectedPlayerIds)],
    numberOfRounds:preserveRounds ? scheduleRoundCount(existing) : rounds.length,
    status:existing ? (existing.status||'published') : 'published',
    rounds:preserveRounds ? existing.rounds : rounds,
    recorded:(existing && !structureChanged && !dateChanged) ? (existing.recorded||{}) : {},
    teams:draft.mode==='tournament' ? (preserveRounds ? (existing.teams||teams) : teams) : null,
    leftover:draft.mode==='tournament' ? (preserveRounds ? (existing.leftover||null) : leftover) : null,
    createdBy:existing ? existing.createdBy : state.currentUser.uid,
    clubId:draft.clubId||'independent',
    creatorName:existing ? (existing.creatorName||currentCreatorName()) : currentCreatorName(),
    createdAt:existing ? (existing.createdAt||now) : now,
    updatedAt:now
  };
  try{ await docRef.set(data); }
  catch(e){ console.error(e); toast('Could not save the Game Plan - check your connection'); return; }
  upsertScheduleLocal(docRef.id,data);
  await createPlayerNotifications({
    type:existing?'schedule_updated':'schedule_created',
    sourceId:docRef.id,
    clubId:data.clubId,
    playerIds:data.selectedPlayerIds,
    title:existing?'Game Plan updated':'New Game Plan',
    body:`${data.title||'Game Plan'} is scheduled for ${fmtDate(data.date)} at ${formatTime(data.startTime)}.`,
    url:'./index.html#schedule',
    extra:{scheduleId:docRef.id,scheduleDate:data.date,startTime:data.startTime}
  });
  if(data.clubId&&data.clubId!=='independent'){
    await createClubSystemChatMessages({
      type:existing?'schedule_updated':'schedule_created',
      sourceId:docRef.id,
      clubId:data.clubId,
      playerIds:data.selectedPlayerIds,
      text:`${data.title||'Game Plan'} ${existing?'was updated':'was created'} for ${fmtDate(data.date)} at ${formatTime(data.startTime)}. Open Game Plan for details.`
    });
  }
  state.activeScheduleId=docRef.id;
  state.scheduleScreen='view';
  state.scheduleDraft=null;
  toast(existing?'Game Plan updated':'Game Plan created');
  render();
}
async function deleteGamePlan(id){
  const sch=scheduleById(id);
  if(!sch) return;
  if(!canManageSchedule(sch)){ toast('Only the owner or an admin can delete this Game Plan'); return; }
  const hasRecorded=Object.keys(sch.recorded||{}).length>0;
  const msg=hasRecorded
    ? 'Delete this Game Plan? Official match records already saved in History will remain.'
    : 'Delete this Game Plan? This cannot be undone.';
  if(!confirm(msg)) return;
  try{ await SCHEDULES_COL.doc(scheduleDocId(sch)).delete(); }
  catch(e){ console.error(e); toast('Could not delete the Game Plan'); return; }
  state.schedules=state.schedules.filter(s=>scheduleDocId(s)!==scheduleDocId(sch));
  backToScheduleList();
  toast('Game Plan deleted');
}
async function deleteGamePlanHistory(key){
  const group=historyGamePlanGroups(false).find(g=>g.key===key);
  if(!group){ toast('History group not found'); return; }
  if(!canManageHistoryGroup(group)){ toast('Only the Game Plan creator or this Club Admin can delete this history'); return; }
  const matchCount=group.matches.length;
  if(!confirm(`Delete this Game Plan history and ${matchCount} recorded game${matchCount===1?'':'s'}? This cannot be undone.`)) return;
  try{
    if(typeof db.batch==='function'){
      const batch=db.batch();
      group.matches.forEach(m=>batch.delete(MATCHES_COL.doc(m.id)));
      if(group.scheduleId) batch.delete(SCHEDULES_COL.doc(group.scheduleId));
      await batch.commit();
    }else{
      await Promise.all([
        ...group.matches.map(m=>MATCHES_COL.doc(m.id).delete()),
        ...(group.scheduleId?[SCHEDULES_COL.doc(group.scheduleId).delete()]:[])
      ]);
    }
  }catch(e){ console.error(e); toast('Could not delete this Game Plan history'); return; }
  const deletedIds=new Set(group.matches.map(m=>m.id));
  state.matches=state.matches.filter(m=>!deletedIds.has(m.id));
  if(group.scheduleId) state.schedules=state.schedules.filter(s=>scheduleDocId(s)!==group.scheduleId);
  state.historyGroupKey=null;
  render();
  toast('Game Plan history deleted');
}
async function endGamePlan(id){
  const sch=scheduleById(id);
  if(!sch) return;
  if(!canManageSchedule(sch)){ toast('Only the Game Plan owner or an admin can end it'); return; }
  if(isScheduleEnded(sch)){ toast('This Game Plan has already ended'); return; }
  if(sch.status==='cancelled'){ toast('A cancelled Game Plan cannot be ended'); return; }
  const unplayedKeys=scheduleUnplayedGameKeys(sch);
  const savedCount=scheduleRecordedCount(sch);
  const unplayedCount=unplayedKeys.length;
  const detail=unplayedCount
    ? `${unplayedCount} scheduled game${unplayedCount===1?' is':'s are'} still without a result and will be shown as not played.`
    : 'Every scheduled game currently has a saved result.';
  if(!confirm(`End this Game Plan now? ${detail} Saved results will remain in History.`)) return;
  const now=new Date().toISOString();
  const updated={
    ...stripScheduleMeta(sch),
    status:'completed',
    endedAt:now,
    completedAt:sch.completedAt||now,
    endedByUid:state.currentUser.uid,
    endedByName:currentCreatorName(),
    endedEarly:unplayedCount>0,
    unplayedGameKeys:unplayedKeys,
    unplayedGameCount:unplayedCount,
    finalRecordedGames:savedCount,
    updatedAt:now
  };
  try{ await SCHEDULES_COL.doc(scheduleDocId(sch)).set(updated); }
  catch(e){ console.error(e); toast('Could not end the Game Plan'); return; }
  upsertScheduleLocal(scheduleDocId(sch),updated);
  state.editingResultId=null;
  state.lateResultKey=null;
  toast(unplayedCount?`Game Plan ended - ${unplayedCount} game${unplayedCount===1?'':'s'} not played`:'Game Plan ended');
  render();
}

async function addDuprMatchToPlan(id){
  const sch=scheduleById(id);
  if(!sch||sch.mode!=='dupr') return;
  if(!canManageSchedule(sch)){ toast('Only the owner or an admin can add matches'); return; }
  if(isScheduleClosed(sch)){ toast('This Game Plan has ended; no new matches can be added'); return; }
  const format=sch.format;
  const t1a=document.getElementById('dupr_more_t1a').value;
  const t1b=format==='doubles'?document.getElementById('dupr_more_t1b').value:null;
  const t2a=document.getElementById('dupr_more_t2a').value;
  const t2b=format==='doubles'?document.getElementById('dupr_more_t2b').value:null;
  const team1=format==='doubles'?[t1a,t1b]:[t1a];
  const team2=format==='doubles'?[t2a,t2b]:[t2a];
  const all=[...team1,...team2];
  if(all.some(x=>!x)){ toast('Pick all players first'); return; }
  if(new Set(all).size!==all.length){ toast("A player can't be picked twice"); return; }
  const baseRound=(sch.rounds&&sch.rounds[0])||{round:1,sitOuts:[],courts:[]};
  const nextCourt=(baseRound.courts||[]).length+1;
  const updated={
    ...stripScheduleMeta(sch),
    rounds:[{...baseRound,courts:[...(baseRound.courts||[]),{court:nextCourt,team1,team2}]}],
    selectedPlayerIds:[...new Set([...schedulePlayers(sch),...all])],
    numberOfRounds:1,
    updatedAt:new Date().toISOString()
  };
  try{ await SCHEDULES_COL.doc(scheduleDocId(sch)).set(updated); }
  catch(e){ console.error(e); toast('Could not add the match'); return; }
  upsertScheduleLocal(scheduleDocId(sch),updated);
  toast('DUPR match added');
  render();
}
function lateCourtResultKey(scheduleId,round,court){
  return `${scheduleId}|${round}|${court}`;
}
function beginLateCourtResult(scheduleId,round,court){
  const sch=scheduleById(scheduleId);
  if(!sch||!canManageSchedule(sch)){ toast('Only the Game Plan owner or an admin can add a late result'); return; }
  if(!isScheduleEnded(sch)){ toast('Late result entry is only needed after a Game Plan has ended'); return; }
  const recKey=`${round}_${court}`;
  if((sch.recorded||{})[recKey]){ toast('This game already has a saved result'); return; }
  state.editingResultId=null;
  state.lateResultKey=lateCourtResultKey(scheduleDocId(sch),round,court);
  render();
}
function cancelLateCourtResult(){
  state.lateResultKey=null;
  render();
}
async function recordCourtResult(scheduleId,round,court,allowLate){
  if(!allowAction(`record:${scheduleId}:${round}:${court}`,2500)) return;
  const sch=scheduleById(scheduleId);
  if(!sch) return;
  if(!canManageSchedule(sch)){ toast(`Only ${sch.creatorName||'the creator'} or an admin can record results`); return; }
  if(sch.status==='cancelled'){ toast('A cancelled Game Plan cannot receive results'); return; }
  const afterEnd=isScheduleEnded(sch);
  const recKey=`${round}_${court}`;
  if(afterEnd && !allowLate){ toast('Use Add Late Result for a game entered after the plan ended'); return; }
  if((sch.recorded||{})[recKey]){ toast('This game already has a saved result'); return; }
  const s1=parseInt(document.getElementById(`res_${round}_${court}_1`).value,10);
  const s2=parseInt(document.getElementById(`res_${round}_${court}_2`).value,10);
  if(isNaN(s1)||isNaN(s2)){ toast('Enter both scores'); return; }
  if(s1<0||s2<0){ toast('Scores cannot be negative'); return; }
  const rd=(sch.rounds||[]).find(r=>r.round===round);
  const ct=rd && (rd.courts||[]).find(c=>c.court===court);
  if(!ct){ toast('This court could not be found'); return; }
  if(afterEnd && !confirm('Save this late result? The game will change from Not played to Saved while the Game Plan remains ended.')) return;
  const matchId=uid('m');
  const now=new Date().toISOString();
  const clubAdminEntry=isAdminForClub(sch.clubId||ACTIVE_CLUB_ID);
  const verificationStatus=clubAdminEntry?'confirmed':'pending';
  const m={
    id:matchId,scheduleId:scheduleDocId(sch),date:sch.date,startTime:sch.startTime||'',court:String(ct.court),
    format:sch.format,mode:sch.mode||'open',team1:ct.team1,team2:ct.team2,score1:s1,score2:s2,
    round,status:'completed',clubId:sch.clubId||ACTIVE_CLUB_ID,recordedByUid:state.currentUser.uid,recordedByPlayerId:state.myPlayerId||null,createdAt:now,
    verificationStatus,confirmedByUid:clubAdminEntry?state.currentUser.uid:null,confirmedAt:clubAdminEntry?now:null,
    recordedAfterPlanEnd:afterEnd,
    gamePlanTitle:sch.title||'',gamePlanVenueName:sch.venueName||'',gamePlanCreatorName:sch.creatorName||'',gamePlanCreatedBy:sch.createdBy||'',gamePlanCourts:Number(sch.courts)||1
  };
  const recorded={...(sch.recorded||{}),[recKey]:matchId};
  const allGameKeys=(sch.rounds||[]).flatMap(r=>(r.courts||[]).map(c=>`${r.round}_${c.court}`));
  const remainingUnplayedKeys=allGameKeys.filter(key=>!recorded[key]);
  const updated={
    ...stripScheduleMeta(sch),
    recorded,
    status:afterEnd?'completed':(sch.status==='published'?'in_progress':sch.status),
    startedAt:sch.startedAt||now,
    updatedAt:now,
    ...(afterEnd?{
      unplayedGameKeys:remainingUnplayedKeys,
      unplayedGameCount:remainingUnplayedKeys.length,
      finalRecordedGames:allGameKeys.length-remainingUnplayedKeys.length,
      endedEarly:remainingUnplayedKeys.length>0,
      lateResultUpdatedAt:now,
      lateResultUpdatedByUid:state.currentUser.uid
    }:{})
  };
  try{
    const matchRef=MATCHES_COL.doc(matchId);
    const scheduleRef=SCHEDULES_COL.doc(scheduleDocId(sch));
    if(typeof db.batch==='function'){
      const batch=db.batch();
      batch.set(matchRef,m);
      batch.set(scheduleRef,updated);
      await batch.commit();
    }else{
      // Deterministic fallback for lightweight environments; production Firebase uses the batch above.
      await matchRef.set(m);
      await scheduleRef.set(updated);
    }
  }catch(e){ console.error(e); toast('Could not save the result'); return; }
  const matchIndex=state.matches.findIndex(x=>x.id===matchId);
  if(matchIndex>=0) state.matches[matchIndex]=m; else state.matches.push(m);
  upsertScheduleLocal(scheduleDocId(sch),updated);
  state.lateResultKey=null;
  toast(clubAdminEntry?(afterEnd?`Late result saved for Court ${court}`:`Court ${court} result saved`):'Result saved and awaiting participant confirmation');
  render();
}
function beginEditCourtResult(scheduleId,matchId){
  const sch=scheduleById(scheduleId);
  if(!sch||!canManageSchedule(sch)){ toast('Only the Game Plan owner or an admin can edit results'); return; }
  const match=state.matches.find(m=>m.id===matchId);
  if(!match){ toast('The saved result could not be found'); return; }
  state.editingResultId=matchId;
  state.lateResultKey=null;
  render();
}
function cancelEditCourtResult(){
  state.editingResultId=null;
  render();
}
async function updateCourtResult(scheduleId,matchId,round,court){
  if(!allowAction(`correct:${matchId}`,2500)) return;
  const sch=scheduleById(scheduleId);
  if(!sch||!canManageSchedule(sch)){ toast('Only the Game Plan owner or an admin can edit results'); return; }
  const recKey=`${round}_${court}`;
  if((sch.recorded||{})[recKey]!==matchId){
    state.editingResultId=null;
    toast('This saved result link has changed - reopen the Game Plan');
    render();
    return;
  }
  const current=state.matches.find(m=>m.id===matchId);
  if(!current){ toast('The saved result could not be found'); return; }
  const score1El=document.getElementById(`edit_res_${round}_${court}_1`);
  const score2El=document.getElementById(`edit_res_${round}_${court}_2`);
  const s1=parseInt(score1El&&score1El.value,10);
  const s2=parseInt(score2El&&score2El.value,10);
  if(isNaN(s1)||isNaN(s2)){ toast('Enter both corrected scores'); return; }
  if(s1<0||s2<0){ toast('Scores cannot be negative'); return; }
  if(s1===Number(current.score1)&&s2===Number(current.score2)){
    state.editingResultId=null;
    toast('No score changes to save');
    render();
    return;
  }
  const clubAdminCorrection=isAdminForClub(sch.clubId||ACTIVE_CLUB_ID);
  const updatedMatch={
    ...current,
    score1:s1,
    score2:s2,
    status:'completed',
    correctedByUid:state.currentUser.uid,
    verificationStatus:clubAdminCorrection?'confirmed':'pending',
    confirmedByUid:clubAdminCorrection?state.currentUser.uid:null,
    confirmedAt:clubAdminCorrection?new Date().toISOString():null,
    disputeReason:null,
    disputedByUid:null,
    disputedAt:null,
    updatedAt:new Date().toISOString()
  };
  try{ await MATCHES_COL.doc(matchId).set(updatedMatch); }
  catch(e){ console.error(e); toast('Could not update the result'); return; }
  state.matches=state.matches.map(m=>m.id===matchId?updatedMatch:m);
  state.editingResultId=null;
  toast(`Court ${court} result updated`);
  render();
}
function deriveCountsFromSchedule(sch){
  const playerIds=Array.from(new Set([
    ...schedulePlayers(sch),
    ...(sch.rounds||[]).flatMap(rd=>[
    ...(rd.courts||[]).flatMap(c=>[...(c.team1||[]),...(c.team2||[])]),
    ...(rd.sitOuts||[])
    ])
  ]));
  const partnerCount={},opponentCount={},sitOutCount={},gameCount={};
  playerIds.forEach(a=>{ sitOutCount[a]=0; gameCount[a]=0; playerIds.forEach(b=>{ if(a!==b){ partnerCount[pairKey(a,b)]=0; opponentCount[pairKey(a,b)]=0; } }); });
  (sch.rounds||[]).forEach(rd=>{
    (rd.sitOuts||[]).forEach(id=>sitOutCount[id]=(sitOutCount[id]||0)+1);
    (rd.courts||[]).forEach(ct=>{
      [...(ct.team1||[]),...(ct.team2||[])].forEach(id=>gameCount[id]=(gameCount[id]||0)+1);
      if(ct.team1.length===2) partnerCount[pairKey(ct.team1[0],ct.team1[1])]++;
      if(ct.team2.length===2) partnerCount[pairKey(ct.team2[0],ct.team2[1])]++;
      ct.team1.forEach(p1=>ct.team2.forEach(p2=>opponentCount[pairKey(p1,p2)]++));
    });
  });
  return {playerIds,partnerCount,opponentCount,sitOutCount,gameCount};
}
function openPlayCourtNumbers(sch){
  const total=Math.max(1,Number(sch&&sch.courts)||1);
  return Array.from({length:total},(_,i)=>i+1);
}
function openPlayCourtGameCounts(sch){
  const counts={};
  openPlayCourtNumbers(sch).forEach(c=>counts[c]=0);
  (sch&&sch.rounds||[]).forEach(rd=>{
    (rd.courts||[]).forEach(ct=>{
      const court=Math.max(1,Number(ct.court)||1);
      counts[court]=(counts[court]||0)+1;
    });
  });
  return counts;
}
function nextOpenPlayCourtNumber(sch){
  const counts=openPlayCourtGameCounts(sch);
  return openPlayCourtNumbers(sch).sort((a,b)=>(counts[a]||0)-(counts[b]||0)||a-b)[0]||1;
}
function openPlayNextRoundSlot(sch){
  const courtNumbers=openPlayCourtNumbers(sch);
  const rounds=Array.isArray(sch&&sch.rounds)?sch.rounds:[];
  const last=rounds[rounds.length-1];
  if(last){
    const used=new Set((last.courts||[]).map(ct=>Number(ct.court)||1));
    const openCourt=courtNumbers.find(c=>!used.has(c));
    if(openCourt) return {round:Number(last.round)||rounds.length,court:openCourt,index:rounds.length-1,append:false};
  }
  return {round:rounds.length+1,court:courtNumbers[0]||1,index:rounds.length,append:true};
}
function lastPlayersInAnyGame(sch){
  const rounds=Array.isArray(sch&&sch.rounds)?sch.rounds:[];
  for(let i=rounds.length-1;i>=0;i--){
    const found=(rounds[i].courts||[]).slice().reverse()[0];
    if(found) return [...(found.team1||[]),...(found.team2||[])];
  }
  return [];
}
async function addExtraRound(scheduleId,courtNumber){
  const sch=scheduleById(scheduleId);
  if(!sch) return;
  if(!canManageSchedule(sch)){ toast('Only the owner or an admin can add games'); return; }
  if(isScheduleClosed(sch)){ toast('This Game Plan has ended; games can no longer be added'); return; }
  const nextRoundNum=scheduleRoundCount(sch)+1;
  let newRound;
  let updatedRounds;
  if(sch.mode==='tournament'){
    const teams=sch.teams&&sch.teams.length ? sch.teams : schedulePlayers(sch).map(id=>[id]);
    const templates=buildTournamentRoundsFromTeams(teams,sch.courts,sch.leftover||null);
    if(!templates.length){ toast('Could not build another tournament round'); return; }
    const t=templates[(scheduleRoundCount(sch))%templates.length];
    newRound={...t,round:nextRoundNum,courts:t.courts.map(c=>({...c}))};
    updatedRounds=[...(sch.rounds||[]),newRound];
  }else{
    const {playerIds,partnerCount,opponentCount,sitOutCount,gameCount}=deriveCountsFromSchedule(sch);
    const capacityPerCourt=sch.format==='singles'?2:4;
    if(playerIds.length<capacityPerCourt){ toast(`Add at least ${capacityPerCourt} players before adding a game`); return; }
    const slot=openPlayNextRoundSlot(sch);
    const court=Math.max(1,Math.min(Math.max(1,Number(sch.courts)||1),Number(courtNumber)||slot.court));
    const last=lastPlayersInAnyGame(sch);
    const next=buildGreedyRound(playerIds,1,capacityPerCourt,sch.format,partnerCount,opponentCount,sitOutCount,null,gameCount,last);
    const newCourt=(next.courts||[]).map(ct=>({...ct,court}))[0];
    if(!newCourt){ toast('Could not build another game'); return; }
    const rounds=[...(sch.rounds||[])];
    if(slot.append){
      newRound={round:slot.round,sitOuts:[],courts:[newCourt]};
      rounds.push(newRound);
    }else{
      const existing={...rounds[slot.index]};
      existing.courts=[...(existing.courts||[]),newCourt].sort((a,b)=>Number(a.court)-Number(b.court));
      rounds[slot.index]=existing;
    }
    const targetIndex=slot.append?rounds.length-1:slot.index;
    const playing=new Set((rounds[targetIndex].courts||[]).flatMap(ct=>[...(ct.team1||[]),...(ct.team2||[])]));
    rounds[targetIndex]={...rounds[targetIndex],sitOuts:playerIds.filter(id=>!playing.has(id))};
    updatedRounds=rounds;
  }
  const updated={...stripScheduleMeta(sch),rounds:updatedRounds,numberOfRounds:updatedRounds.length,updatedAt:new Date().toISOString()};
  try{ await SCHEDULES_COL.doc(scheduleDocId(sch)).set(updated); }
  catch(e){ console.error(e); toast('Could not add another game'); return; }
  upsertScheduleLocal(scheduleDocId(sch),updated);
  toast('Added another game');
  render();
}

async function removeExtraRound(scheduleId){
  const sch=scheduleById(scheduleId);
  if(!sch) return;
  if(!canManageSchedule(sch)){ toast('Only the owner or an admin can remove games'); return; }
  if(isScheduleClosed(sch)){ toast('This Game Plan has ended; games can no longer be removed'); return; }

  const rounds=Array.isArray(sch.rounds)?sch.rounds:[];
  if(rounds.length<=0){ toast('No games to remove yet'); return; }

  const lastRound=rounds[rounds.length-1];
  const lastRoundNum=lastRound.round;
  const lastRoundCourts=Array.isArray(lastRound.courts)?lastRound.courts:[];
  const latestCourt=lastRoundCourts[lastRoundCourts.length-1];
  if(!latestCourt){ toast('No games to remove yet'); return; }
  const recorded=sch.recorded||{};
  const latestKey=`${lastRoundNum}_${latestCourt.court}`;
  const savedKeys=recorded[latestKey]?[latestKey]:[];

  if(savedKeys.length){
    toast(`Round ${lastRoundNum} Court ${latestCourt.court} has a saved result and cannot be removed`);
    return;
  }

  if(!confirm(`Remove Round ${lastRoundNum} Court ${latestCourt.court}?`)) return;

  const remainingRounds=rounds.slice();
  const remainingCourts=lastRoundCourts.slice(0,-1);
  if(remainingCourts.length){
    const playing=new Set(remainingCourts.flatMap(ct=>[...(ct.team1||[]),...(ct.team2||[])]));
    const playerIds=schedulePlayers(sch);
    remainingRounds[remainingRounds.length-1]={...lastRound,courts:remainingCourts,sitOuts:playerIds.filter(id=>!playing.has(id))};
  }else{
    remainingRounds.pop();
  }
  const cleanedRecorded={};
  Object.entries(recorded).forEach(([key,value])=>{
    if(key!==latestKey) cleanedRecorded[key]=value;
  });
  const updated={
    ...stripScheduleMeta(sch),
    rounds:remainingRounds,
    recorded:cleanedRecorded,
    numberOfRounds:remainingRounds.length,
    updatedAt:new Date().toISOString()
  };
  try{ await SCHEDULES_COL.doc(scheduleDocId(sch)).set(updated); }
  catch(e){ console.error(e); toast('Could not remove the latest game'); return; }
  upsertScheduleLocal(scheduleDocId(sch),updated);
  toast(`Removed Round ${lastRoundNum} Court ${latestCourt.court}`);
  render();
}

/* ============================= RENDER: SHELL ============================= */
function setTab(t){
  if(t==='chat'||t==='roster'){
    state.clubWorkspaceView=t==='chat'?'chat':'members';
    t='clubs';
  }
  if(['profile','clubs','history','schedule'].includes(t)&&['year','month','week'].includes(state.dateRange)){
    const bounds=dateRangeBounds(state.dateRange);
    state.customDateStart=bounds.start||'';
    state.customDateEnd=bounds.end||'';
    state.dateRange='custom';
  }
  state.tab=t;
  if(t==='clubs'&&state.clubWorkspaceView==='chat'){
    const ids=chatClubIds();
    const active=ids.includes(state.chatClubId)?state.chatClubId:ids[0];
    if(active){ state.chatClubId=active; markChatRead(active); }
  }
  if(t!=='clubs'&&state.clubDetailSource!=='profile') state.clubHubSelectedId=null;
  if(t!=='profile'&&state.clubDetailSource==='profile') state.clubDetailSource=null;
  if(t==='schedule'&&state.dateRange==='custom') state.scheduleFilter='dates';
  state.navOpen=false;
  if(t!=='profile'){ state.profileNameEditing=false; state.profileNameBusy=false; }
  if(t!=='history') state.historyGroupKey=null;
  refreshScheduleSync();
  refreshChatSync();
  render();
}
function toggleNavigation(){ if(state.showAuthModal||state.playerModalId||state.showAddPlayer||state.clubHubSelectedId||state.supportPanelOpen) return; state.navOpen=!state.navOpen; render(); }

function render(){
  const root = document.getElementById('root');
  document.body.classList.toggle('modal-open', Boolean(state.playerModalId || state.showAddPlayer || state.showAuthModal || state.clubHubSelectedId || state.supportPanelOpen));
  if(state.loading){
    root.innerHTML = `<div style="padding:80px 0;text-align:center;color:var(--muted);">Loading the club...</div>`;
    return;
  }
  root.innerHTML = `
    ${renderTopbar()}
    ${renderSupportButton()}
    ${renderDateRangePicker()}
    <div id="tabBody">${renderTabBody()}</div>
    ${state.playerModalId ? renderPlayerModal() : ''}
    ${state.showAddPlayer ? renderAddPlayerModal() : ''}
    ${state.showAuthModal ? renderAuthModal() : ''}
    ${state.clubHubSelectedId && state.clubDetailSource==='profile' ? renderProfileClubDetailModal() : ''}
    ${state.supportPanelOpen ? renderSupportModal() : ''}
  `;
  wireTabBodyEvents();
  wireDivisionTipSlider();
}

function renderTopbar(){
  const tabs = [
    ['dashboard','Dashboard'],['clubs','Club Hub'],['schedule','Game Plan'],['h2h','H2H'],
    ['history','History'],['profile','My Profile'],['settings','Settings']
  ];
  const pendingClubRequests=pendingManagedJoinRequestCount();
  const unreadChatMentions=totalUnreadMentions();
  const activeLabel=(tabs.find(([key])=>key===state.tab)||tabs[0])[1];
  const accountComponent=state.currentUser ? `
        <div class="account-chip" onclick="setTab('profile')">
          ${avatarHTML(state.players.find(p=>p.id===state.myPlayerId), 28)}
          ${isAdmin() ? `<span class="account-role-tag">${isSuperAdmin()?'Admin':'Club Admin'}</span>` : ''}
          <button class="logout-icon-btn" type="button" aria-label="Sign out" title="Sign out" onclick="event.stopPropagation(); logoutUser();"><span class="logout-icon" aria-hidden="true">&#x23FB;</span><span class="logout-label">Sign out</span></button>
        </div>
      ` : `<button class="btn btn-ghost btn-sm" onclick="openAuthModal('login')">Sign in</button>`;
  return `
  <div class="topbar">
    <div class="brand">
      <div class="brand-mark"><img src="courtrush-icon.svg" alt="" /></div>
      <div>
        <div class="brand-name">CourtRush</div>
        <div class="brand-sub">Rush the court. Rule the game.</div>
      </div>
    </div>
    <div class="primary-nav">
      <button class="nav-toggle" type="button" aria-expanded="${state.navOpen?'true':'false'}" aria-controls="primaryNavigation" onclick="toggleNavigation()"><span class="nav-toggle-icon" aria-hidden="true">${iconSVG('menu')}</span><span>${esc(activeLabel)}</span></button>
      <nav id="primaryNavigation" class="toolbar ${state.navOpen?'open':''}" aria-label="Primary navigation">
        ${tabs.map(([k,l])=> `<button type="button" class="${state.tab===k?'active':''}" ${state.tab===k?'aria-current="page"':''} onclick="setTab('${k}')">${l}${k==='clubs'&&pendingClubRequests?`<span class="nav-count" aria-label="${pendingClubRequests} pending club join request${pendingClubRequests===1?'':'s'}">${pendingClubRequests}</span>`:k==='chat'&&unreadChatMentions?`<span class="nav-count" aria-label="${unreadChatMentions} unread Club Chat mention${unreadChatMentions===1?'':'s'}">${unreadChatMentions}</span>`:''}</button>`).join('')}
      </nav>
    </div>
    <div class="topbar-actions ${state.currentUser?'logged-in':''}">
      <div class="nav-account">${accountComponent}</div>
      <button class="btn btn-ghost theme-toggle" type="button" onclick="toggleTheme()" aria-label="Switch to ${themeValue()==='dark'?'light':'dark'} theme" title="${themeValue()==='dark'?'Light':'Dark'} theme">${iconSVG(themeValue()==='dark'?'sun':'moon')}</button>
    </div>
  </div>`;
}
function renderExactDateSelector(contextLabel){
  const label=contextLabel||'Statistics and records';
  return `<div class="exact-date-selector" aria-label="Exact date selector">
    <div class="exact-date-copy"><strong>Date selector</strong><span>${esc(label)} - ${esc(activeDateRangeSummary())}</span></div>
    <form class="exact-date-form" onsubmit="applyCustomDateRange(event)">
      <div class="exact-date-field"><label for="customDateStart">From</label><input id="customDateStart" type="date" value="${esc(state.customDateStart||'')}"/></div>
      <div class="exact-date-field"><label for="customDateEnd">To</label><input id="customDateEnd" type="date" value="${esc(state.customDateEnd||'')}"/></div>
      <button class="btn btn-primary btn-sm" type="submit">Apply dates</button>
      <button class="btn btn-ghost btn-sm" type="button" onclick="clearCustomDateRange()">All dates</button>
    </form>
  </div>`;
}
function renderDateRangePicker(embedded){
  if(!embedded&&(state.tab==='schedule'||state.tab==='clubs'||state.tab==='chat'||state.tab==='roster'||state.tab==='profile')) return '';
  if(embedded||state.tab==='history') return renderExactDateSelector(state.tab==='profile'?'Profile statistics and match history':state.tab==='history'?'History records':'Selected statistics');
  return `
  <div class="date-range-bar" aria-label="Date range filter">
    <div class="date-range-copy">
      <strong>${activeDateRangeLabel()}</strong>
      <span>${activeDateRangeSummary()}</span>
    </div>
    <div class="date-range-options" role="group" aria-label="Choose date range">
      ${Object.entries(DATE_RANGE_META).map(([key,meta])=>`<button class="date-range-option ${state.dateRange===key?'active':''}" onclick="setDateRange('${key}')">${meta.label}</button>`).join('')}
    </div>
  </div>`;
}

function renderAuthModal(){
  const mode = state.authMode;
  const clubs=clubsForDisplay();
  return `
  <div class="modal-overlay" onclick="if(event.target===this){closeAuthModal();}">
    <div class="modal" style="max-width:400px;">
      <button class="modal-close" onclick="closeAuthModal()">&times;</button>
      <h2 style="font-size:24px;color:var(--court-deep);margin-bottom:4px;">${mode==='register' ? 'Create your player account' : 'Sign in'}</h2>
      <p class="small muted" style="margin-bottom:14px;">${mode==='register' ? 'Choose a club to send a membership request, or register without one and join later through Club Hub.' : 'Welcome back.'}</p>
      <button class="btn btn-google" type="button" onclick="signInWithGoogle()" ${state.authBusy?'disabled':''}>${googleLogo()}<span>${state.authBusy?'Please wait...':'Continue with Google'}</span></button>
      <div class="auth-divider"><span>or use email</span></div>
      <form onsubmit="submitAuthForm(event)">
        ${mode==='register' ? `<div class="field"><label>Your name</label><input type="text" id="auth_name" placeholder="e.g. Jamie Cruz"/></div><div class="field"><label>Request to join a club?</label><select id="auth_club"><option value="">Not yet - I will join through Club Hub later</option>${clubs.map(club=>`<option value="${esc(club.id)}">${esc(club.name)} - ${esc(club.origin||'Origin pending')}</option>`).join('')}</select><div class="small muted" style="margin-top:5px;">The selected club administrators will review your request.</div></div>` : ''}
        <div class="field"><label>Email</label><input type="text" id="auth_email" placeholder="you@email.com"/></div>
        <div class="field"><label>Password</label><input type="password" id="auth_password" placeholder="At least 6 characters"/></div>
        <button class="btn btn-primary" type="submit" style="width:100%;" ${state.authBusy?'disabled':''}>${state.authBusy ? 'Please wait...' : (mode==='register' ? 'Create account' : 'Sign in')}</button>
      </form>
      ${mode==='login'?`<div style="text-align:center;margin-top:11px;"><button class="link-btn" type="button" onclick="sendPasswordResetFromModal()" ${state.authBusy?'disabled':''}>Forgot password?</button></div>`:''}
      <p class="small muted" style="margin-top:14px;text-align:center;">
        ${mode==='register'
          ? `Already registered? <button class="link-btn" onclick="state.authMode='login'; render();">Sign in</button>`
          : `New here? <button class="link-btn" onclick="state.authMode='register'; render();">Create an account</button>`}
      </p>
    </div>
  </div>`;
}

function renderTabBody(){
  if(state.tab==='dashboard') return renderDashboard();
  if(state.tab==='clubs') return renderClubHub();
  if(state.tab==='chat') return renderClubChat();
  if(state.tab==='roster') return renderRoster();
  if(state.tab==='schedule') return renderSchedule();
  if(state.tab==='h2h') return renderH2H();
  if(state.tab==='history') return renderHistory();
  if(state.tab==='profile') return renderMyProfile();
  if(state.tab==='settings') return renderProfileSettings();
  return '';
}

/* ============================= DASHBOARD ============================= */
function renderDashboard(){
  const activeMatches=completedMatchesInActiveRange();
  const totalPlayers = state.players.length;
  const totalClubs = clubsForDisplay().length;
  const totalMatches = activeMatches.length;
  const topClub = computeTopClub();
  const stats = state.players.map(p=> ({p, s: computePlayerStats(p.id)}));
  const withGames = stats.filter(x=> x.s.gamesPlayed>0);
  const hot = [...withGames].sort((a,b)=> b.s.avgDiff - a.s.avgDiff).slice(0,5);
  const active = [...withGames].sort((a,b)=> b.s.gamesPlayed - a.s.gamesPlayed).slice(0,5);
  const mvpCounts=computeMvpCounts();
  let priorMvpCount=null,priorMvpRank=0;
  const mvpLeaders=state.players
    .map(p=>({p,s:computePlayerStats(p.id),mvp:mvpCounts[p.id]||0,gamePlans:playerGamePlanCount(p.id)}))
    .filter(x=>x.mvp>0)
    .sort((a,b)=>b.mvp-a.mvp||b.s.wins-a.s.wins||a.s.losses-b.s.losses||a.p.name.localeCompare(b.p.name,undefined,{sensitivity:'base'}))
    .slice(0,5)
    .map((row,index)=>{
      const rank=row.mvp===priorMvpCount?priorMvpRank:index+1;
      priorMvpCount=row.mvp;
      priorMvpRank=rank;
      return {...row,rank};
    });
  if(totalPlayers===0){
    return `
    <div class="hero">
      <div class="hero-top">
        <h1>Welcome to the club.</h1>
        <p>Add your first players to start tracking games, +/- and who plays well with whom.</p>
      </div>
      <div style="position:relative;z-index:1;margin-top:20px;">
        <button class="btn btn-ball" onclick="setTab('roster')">Build Club Members</button>
      </div>
    </div>`;
  }

  return `
  <div class="hero">
    <div class="hero-top">
      <h1>Rising Club Companion</h1>
      <p>Every rally counted. Track who's playing, how they're performing, and who to put on the same side of the net next.</p>
    </div>
    <div class="score-tiles">
      <div class="score-tile"><div class="num">${totalPlayers}</div><div class="lbl">Players</div></div>
      <div class="score-tile"><div class="num">${totalClubs}</div><div class="lbl">Clubs</div></div>
      <div class="score-tile"><div class="num">${totalMatches}</div><div class="lbl">Games logged</div></div>
      <div class="score-tile" title="Ranked by unique confirmed games, then MVP awards">
        <div class="num top-club-name">${topClub?esc(topClub.club.name):'-'}</div>
        <div class="lbl">Top club</div>
        <div class="meta">${topClub?`${topClub.games} unique game${topClub.games===1?'':'s'} - ${topClub.mvp} MVP${topClub.mvp===1?'':'s'}`:'No qualifying activity'}</div>
      </div>
    </div>
  </div>

  <div class="panel">
    <div class="section-title"><h2>Leaderboard</h2><span class="small muted">${activeDateRangeLabel()} &middot; Minimum 1 game played</span></div>
    ${withGames.length===0 ? `<div class="empty"><p>No games logged yet - create a Game Plan and save results once the first games wrap up.</p></div>` : `
    <div class="board-grid dashboard-board-grid">
      <div>
        <div class="eyebrow">Hot paddles - by avg +/-</div>
        ${hot.map((x,i)=> `
          <div class="board-row">
            <span class="rank">${i+1}</span>
            ${avatarHTML(x.p,26)}
            <span class="board-name">${esc(x.p.name)}<div class="board-sub">${x.s.gamesPlayed} games</div></span>
            ${diffPill(x.s.avgDiff,1)}
          </div>`).join('')}
      </div>
      <div>
        <div class="eyebrow">Most active - by games played</div>
        ${active.map((x,i)=> `
          <div class="board-row">
            <span class="rank">${i+1}</span>
            ${avatarHTML(x.p,26)}
            <span class="board-name">${esc(x.p.name)}<div class="board-sub">${x.s.avgDaysPerWeek.toFixed(1)} days/week</div></span>
            <span class="mono small muted">${x.s.gamesPlayed}g</span>
          </div>`).join('')}
      </div>
      <div>
        <div class="eyebrow">MVP leaders &middot; by Game Plans won</div>
        ${mvpLeaders.length?mvpLeaders.map(x=> `
          <div class="board-row">
            <span class="rank">${x.rank}</span>
            ${avatarHTML(x.p,26)}
            <span class="board-name">${esc(x.p.name)}<div class="board-sub">${x.s.wins}-${x.s.losses} W/L - ${x.gamePlans} Game Plan${x.gamePlans===1?'':'s'} - ${x.s.gamesPlayed} games</div></span>
            ${mvpPill(x.mvp)}
          </div>`).join(''):`<div class="empty" style="padding:24px 8px;"><p>No MVP awarded in ${esc(activeDateRangeLabel())}.</p></div>`}
      </div>
    </div>`}
  </div>

  <div class="panel">
    <div class="section-title"><h2>Quick actions</h2></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      <button class="btn btn-primary" onclick="setTab('schedule')">Create today's Game Plan</button>
      <button class="btn btn-ghost" onclick="setTab('clubs')">Explore Club Hub</button>
      <button class="btn btn-ghost" onclick="setTab('roster')">Manage Club Members</button>
      <button class="btn btn-ghost" onclick="setTab('history')">View match history</button>
    </div>
  </div>
  `;
}

/* ============================= CLUB HUB ============================= */
function selectClubHub(clubId){ state.clubHubSelectedId=clubId; state.clubDetailSource=null; state.clubProfileRoleFilter='all'; render(); }
function openProfileClubDetail(clubId){ state.clubHubSelectedId=clubId; state.clubDetailSource='profile'; state.clubProfileRoleFilter='all'; render(); }
function goToClubHubFromProfile(clubId){ state.clubDetailSource=null; state.clubWorkspaceView='hub'; state.clubHubSelectedId=clubId; setTab('clubs'); }
function closeClubHubProfile(){ state.clubHubSelectedId=null; state.clubDetailSource=null; render(); }
function setClubProfileRoleFilter(role){
  state.clubProfileRoleFilter=['all','club_admin','co_admin','staff','member'].includes(role)?role:'all';
  render();
}
function playerFirstName(player){
  return String(player&&player.name||'Player').trim().split(/\s+/)[0]||'Player';
}
function renderClubAdminPanel(selected,availablePlayers){
  const joinRequests=pendingJoinRequestsForClub(selected.id).map(request=>({request,player:state.players.find(p=>p.id===request.playerId)})).filter(row=>row.player);
  const roleMembers=membersForClub(selected.id);
  const detailsForm=selected.legacy?`
    <div class="divider"></div>
    <form onsubmit="completeLegacyClubRegistration(event)">
      <div class="eyebrow">Maintain Rising Club</div>
      <div class="field-row">
        <div class="field"><label for="legacyClubName">Club name</label><input id="legacyClubName" type="text" maxlength="80" value="${esc(selected.name)}" required/></div>
        <div class="field"><label for="legacyClubOrigin">Origin / complete address</label><input id="legacyClubOrigin" type="text" maxlength="200" placeholder="Barangay, municipality/city, province" required/></div>
      </div>
      <button class="btn btn-primary btn-sm" type="submit" ${state.clubBusy?'disabled':''}>Save permanent club record</button>
    </form>`:`
    <div class="divider"></div>
    <form onsubmit="saveClubDetails(event,${jsArg(selected.id)})">
      <div class="eyebrow">Edit club details</div>
      <div class="field-row">
        <div class="field"><label for="editClubName">Club name</label><input id="editClubName" type="text" maxlength="80" value="${esc(selected.name)}" required/></div>
        <div class="field"><label for="editClubOrigin">Origin / complete address</label><input id="editClubOrigin" type="text" maxlength="200" value="${esc(selected.origin||'')}" required/></div>
      </div>
      <button class="btn btn-primary btn-sm" type="submit" ${state.clubBusy?'disabled':''}>Save club details</button>
    </form>`;
  return `<div class="club-admin-panel">
    <div class="section-title"><div><div class="eyebrow">Club-scoped controls</div><h2>${esc(selected.name)} administration</h2></div><span class="club-chip admin">${joinRequests.length?`${joinRequests.length} pending`:'Only this club'}</span></div>
    ${joinRequests.length?`<div class="form-note"><strong>Membership requests</strong><div class="club-request-list">${joinRequests.map(({request,player})=>`<div class="club-request">${avatarHTML(player,34)}<div class="club-request-copy"><strong>${esc(player.name)}</strong><span>Requested ${request.requestedAt?esc(fmtDate(String(request.requestedAt).slice(0,10))):'recently'}</span></div><div class="club-request-actions"><button class="btn btn-primary btn-sm" type="button" onclick="reviewClubJoinRequest(${jsArg(selected.id)},${jsArg(player.id)},true)">Approve</button><button class="btn btn-danger btn-sm" type="button" onclick="reviewClubJoinRequest(${jsArg(selected.id)},${jsArg(player.id)},false)">Decline</button></div></div>`).join('')}</div></div><div class="divider"></div>`:''}
    <div class="field-row">
      <div><div class="field"><label for="clubExistingPlayer">Add existing player</label><select id="clubExistingPlayer" ${state.clubBusy?'disabled':''}><option value="">Choose a player...</option>${availablePlayers.map(player=>`<option value="${esc(player.id)}">${esc(player.name)}</option>`).join('')}</select></div><button class="btn btn-ghost btn-sm" type="button" onclick="addExistingClubMember(${jsArg(selected.id)})" ${availablePlayers.length&&!state.clubBusy?'':'disabled'}>Add existing player</button></div>
      <div><div class="field"><label for="clubNewMemberName">Create new member profile</label><input id="clubNewMemberName" type="text" maxlength="80" placeholder="Player full name" ${state.clubBusy?'disabled':''}/></div><button class="btn btn-ghost btn-sm" type="button" onclick="createClubMember(${jsArg(selected.id)})" ${state.clubBusy?'disabled':''}>Create &amp; add member</button></div>
    </div>
    ${canAssignClubRoles(selected.id)?`<div class="divider"></div><div class="section-title"><div><div class="eyebrow">Club leadership</div><h2>Admin transfer &amp; roles</h2></div><span class="small muted">Roles require a signed-in member account</span></div><div class="club-role-list">${roleMembers.map(player=>{const role=clubRoleForPlayer(selected.id,player);const locked=role==='club_admin';const canTransfer=canTransferPrimaryClubAdmin(selected.id)&&player.ownerUid&&!locked;return `<div class="club-role-row"><div class="club-role-person">${avatarHTML(player,36)}<div><strong>${esc(player.name)}</strong><span>${player.ownerUid?clubRoleLabel(role):'Member - account not linked'}</span></div></div><div class="club-membership-actions"><select aria-label="Role for ${esc(player.name)}" onchange="setClubMemberRole(${jsArg(selected.id)},${jsArg(player.id)},this.value)" ${locked||!player.ownerUid?'disabled':''}><option value="member" ${role==='member'?'selected':''}>Member</option><option value="staff" ${role==='staff'?'selected':''}>Staff</option><option value="co_admin" ${role==='co_admin'?'selected':''}>Co-Admin</option>${locked?'<option value="club_admin" selected>Club Admin</option>':''}</select>${canTransfer?`<button class="btn btn-primary btn-sm" type="button" onclick="transferPrimaryClubAdmin(${jsArg(selected.id)},${jsArg(player.id)})">Make Club Admin</button>`:''}</div></div>`;}).join('')}</div>`:''}
    ${detailsForm}
    <div class="club-danger-zone">
      <div><strong>Remove club from Club Hub</strong><span>Members, Game Plans, results, and historical statistics will be preserved. The club will disappear from the directory and cannot accept new activity.</span></div>
      <button class="btn btn-danger btn-sm" type="button" onclick="removeClubFromHub(${jsArg(selected.id)})" ${state.clubBusy?'disabled':''}>Remove club</button>
    </div>
  </div>`;
}
function setClubWorkspaceView(view){
  if(!['hub','chat','members'].includes(view)) return;
  state.clubWorkspaceView=view;
  state.clubHubSelectedId=null;
  if(view==='chat'){
    const ids=visibleChatClubIds();
    const active=ids.includes(state.chatClubId)?state.chatClubId:ids[0];
    if(active){ state.chatClubId=active; markChatRead(active); }
  }
  refreshChatSync();
  render();
}
function renderClubWorkspaceNav(){
  const pendingClubRequests=pendingManagedJoinRequestCount();
  const unreadChatMentions=totalUnreadMentions();
  const active=state.clubWorkspaceView||'hub';
  const items=[
    ['hub','Club Profile','Directory, join requests, and club statistics',pendingClubRequests],
    ['chat','Club Chat','Member-only conversations and mentions',unreadChatMentions],
    ['members','Club Members','Sortable roster and player lookup',0]
  ];
  return `<div class="club-workspace-nav" role="tablist" aria-label="Club Hub workspace">${items.map(([key,title,copy,count])=>`<button class="club-workspace-tab ${active===key?'active':''}" type="button" role="tab" aria-selected="${active===key?'true':'false'}" onclick="setClubWorkspaceView('${key}')"><span><strong>${title}</strong><span>${copy}</span></span>${count?`<span class="nav-count" aria-label="${count} ${key==='chat'?'unread mention':'pending club request'}${count===1?'':'s'}">${count}</span>`:''}</button>`).join('')}</div>`;
}
function renderClubHub(){
  const view=state.clubWorkspaceView||'hub';
  return `<section class="club-hub-hero">
    <div><div class="eyebrow" style="color:rgba(255,255,255,.62);">Club workspace</div><h1>Club Hub</h1><p>Move between club profiles, member conversations, and the sortable club roster from one focused workspace.</p></div>
    ${isSignedIn()?`<button class="btn btn-ball" type="button" onclick="state.showClubRegistration=!state.showClubRegistration;state.clubWorkspaceView='hub';render();">${state.showClubRegistration?'Cancel':'Register a club'}</button>`:`<button class="btn btn-ball" type="button" onclick="openAuthModal('register')">Sign up to register a club</button>`}
  </section>
  ${renderClubWorkspaceNav()}
  <div class="club-workspace-panel">${view==='chat'?renderClubChat():view==='members'?renderRoster():renderClubDirectory()}</div>`;
}
function renderClubMemberRow(player,club,options={}){
  const canManage=!!options.canManage;
  const showAdminMeta=canManage||canAdminViewPlayerPrivateMeta(player);
  const stats=computePlayerClubStats(player.id,club.id,false);
  const mvp=(options.mvpCounts&&options.mvpCounts[player.id])||0;
  const role=clubRoleForPlayer(club.id,player);
  const email=playerEmail(player);
  const playerCode=player.player_id||player.playerId||player.id||'';
  const meta=showAdminMeta?`<span class="club-member-admin-meta">${email?`<span>${esc(email)}</span>`:''}${playerCode?`<span>ID: ${esc(playerCode)}</span>`:''}</span>`:'';
  const statsBlock=showAdminMeta&&isSignedIn()?`<span class="club-member-row-stats"><span><b>${stats.gamesPlayed}</b> games</span><span><b>${stats.wins}-${stats.losses}</b> W/L</span><span><b>${mvp}</b> MVP</span></span>`:'';
  return `<div class="club-member-row ${showAdminMeta?'admin-view':'compact-view'}"><button type="button" class="club-member-profile" onclick="openPlayerProfile(${jsArg(player.id)},{source:'clubHub',clubId:${jsArg(club.id)}})">${avatarHTML(player,38)}<span class="club-member-row-copy"><strong class="club-member-name-line"><span>${esc(showAdminMeta?player.name:playerFirstName(player))}</span></strong>${meta}${statsBlock}</span><span class="my-profile-badge club-member-division">${esc(playerDivisionLabel(player))}</span></button>${role!=='member'?`<span class="club-chip ${role==='staff'?'staff':'admin'}">${esc(clubRoleLabel(role))}</span>`:''}${canManage&&player.id!==state.myPlayerId&&role!=='club_admin'?`<button class="btn btn-danger btn-sm" type="button" onclick="removeClubMember(${jsArg(club.id)},${jsArg(player.id)})">Remove</button>`:''}${player.id===state.myPlayerId&&role==='club_admin'?'<span class="club-chip admin">You - Admin</span>':''}</div>`;
}

function renderClubDirectory() {
  const clubs=clubsForDisplay();
  const topMemberClubRanks=topClubsByMemberCount();
  const selected=clubById(state.clubHubSelectedId);
  const selectedId=selected?selected.id:null;
  const selectedMembers=selected?membersForClub(selected.id):[];
  const activeRoleFilter=['all','club_admin','co_admin','staff','member'].includes(state.clubProfileRoleFilter)?state.clubProfileRoleFilter:'all';
  const roleFilterLabels={all:'All',club_admin:'Admin',co_admin:'Co-Admin',staff:'Staff',member:'Members'};
  const roleFilterCounts=selectedMembers.reduce((counts,player)=>{ const role=clubRoleForPlayer(selected&&selected.id,player); counts[role]=(counts[role]||0)+1; counts.all+=1; return counts; },{all:0,club_admin:0,co_admin:0,staff:0,member:0});
  const filteredMembers=selected?sortClubMembersByRole(selected.id,activeRoleFilter==='all'?selectedMembers:selectedMembers.filter(player=>clubRoleForPlayer(selected.id,player)===activeRoleFilter)):[];
  const canManage=selected?isAdminForClub(selected.id):false;
  const availablePlayers=selected?state.players.filter(p=>!playerIsMemberOfClub(p,selected.id)&&!pendingJoinRequest(selected.id,p.id)).sort((a,b)=>a.name.localeCompare(b.name)):[];
  const selectedGames=selected?clubMemberMatches(selected.id,false):[];
  const selectedMvpCounts=selected?computeMvpCounts(false):{};
  const leaders=selected?clubMvpLeaders(selected.id,false):[];
  const totalMvp=selectedMembers.reduce((sum,p)=>sum+(selectedMvpCounts[p.id]||0),0);
  const me=state.players.find(p=>p.id===state.myPlayerId);
  const myActiveClubCount=me?activePlayerClubIds(me).length:0;
  const isSelectedMember=!!(selected&&me&&playerIsMemberOfClub(me,selected.id));
  const myPendingRequest=selected&&state.myPlayerId?pendingJoinRequest(selected.id,state.myPlayerId):null;
  const joinControl=!selected?'':!isSignedIn()?`<button class="btn btn-ball btn-sm" type="button" onclick="openAuthModal('register')">Sign up to join</button>`:!state.myPlayerId?`<span class="club-chip">Link a player profile to join</span>`:isSelectedMember?`<span class="club-chip admin">Member</span>`:myPendingRequest?`<span class="club-chip">Request pending</span>`:`<button class="btn btn-ball btn-sm" type="button" onclick="requestClubJoin(${jsArg(selected.id)})">${myActiveClubCount?'Join another club':'Join club'}</button>`;
  return `
  ${state.showClubRegistration?`
  <section class="panel">
    <div class="section-title"><h2>Register a club</h2><span class="small muted">The registering player becomes the first Club Admin</span></div>
    ${!state.myPlayerId?`<div class="form-note">Your account must be linked to a player profile before registering a club.</div>`:`<form onsubmit="submitClubRegistration(event)"><div class="field-row"><div class="field"><label for="newClubName">Club name</label><input id="newClubName" type="text" maxlength="80" placeholder="e.g. Capitol Pickleball Club" required/></div><div class="field"><label for="newClubOrigin">Origin / complete address</label><input id="newClubOrigin" type="text" maxlength="200" placeholder="Barangay, municipality/city, province" required/></div></div><button class="btn btn-primary" type="submit" ${state.clubBusy?'disabled':''}>${state.clubBusy?'Registering...':'Register club & become Club Admin'}</button></form>`}
  </section>`:''}
  <section class="club-grid" aria-label="Registered clubs">
    ${clubs.map(club=>{
      const members=membersForClub(club.id);
      const games=clubMemberMatches(club.id,false).length;
      const pending=isAdminForClub(club.id)?pendingJoinRequestsForClub(club.id).length:0;
      const myMember=!!(me&&playerIsMemberOfClub(me,club.id));
      const myPending=!!(me&&pendingJoinRequest(club.id,me.id));
      const myRole=myMember&&me?clubRoleForPlayer(club.id,me):'member';
      const rank=topMemberClubRanks[club.id];
      return `<article class="club-card ${selectedId===club.id?'active':''}" role="button" tabindex="0" aria-label="Open ${esc(club.name)} details" onclick="selectClubHub(${jsArg(club.id)})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectClubHub(${jsArg(club.id)})}"><div class="club-card-head"><div class="club-card-title">${rank?`<span class="club-rank-star" title="#${rank} by member count" aria-label="#${rank} by member count">&#9733;</span>`:""}<h2>${esc(club.name)}</h2></div><div class="club-chip-list" style="margin-top:0;justify-content:flex-end;">${myMember?'<span class="club-chip">Member</span>':myPending?'<span class="club-chip">Request pending</span>':''}${myRole==='club_admin'?'<span class="club-chip admin">Club Admin</span>':myRole==='co_admin'?'<span class="club-chip admin">Co-Admin</span>':myRole==='staff'?'<span class="club-chip staff">Staff</span>':''}${pending?`<span class="club-chip">${pending} pending</span>`:''}</div></div><div class="club-origin"><span aria-hidden="true">*</span><span>${esc(club.origin||'Origin address not supplied')}</span></div><div class="club-card-metrics"><div class="club-card-metric"><strong>${members.length}</strong><span>Members</span></div><div class="club-card-metric"><strong>${games}</strong><span>Club Games</span></div></div><button class="btn btn-ghost btn-sm" type="button" onclick="event.stopPropagation();selectClubHub(${jsArg(club.id)})">View club</button></article>`;
    }).join('')}
  </section>
  ${selected?`
  <div class="modal-overlay club-detail-overlay" role="dialog" aria-modal="true" aria-labelledby="clubDetailTitle" onclick="if(event.target===this){closeClubHubProfile();}">
  <div class="modal club-detail-modal">
    <button class="modal-close" type="button" onclick="closeClubHubProfile()" aria-label="Close ${esc(selected.name)} club details">&times;</button>
    <div class="club-detail-header section-title"><div><div class="eyebrow">${esc(selected.origin||'Origin unavailable')}</div><h2 id="clubDetailTitle">${esc(selected.name)} club profile</h2></div><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">${joinControl}<span class="diff-pill diff-zero">Overall</span></div></div>
    <section id="clubProfile">
    ${selected.legacy?`<div class="form-note" style="margin-bottom:14px;">This is the backward-compatible Rising Club record. Register a permanent club record with its complete origin/address when the club is ready to migrate.</div>`:''}
    <div class="club-profile-summary"><div class="club-profile-stat"><strong>${selectedMembers.length}</strong><span>Club members</span></div><div class="club-profile-stat"><strong>${selectedGames.length}</strong><span>Club Games</span></div><div class="club-profile-stat"><strong>${totalMvp}</strong><span>MVP awards</span></div></div>
    <div class="section-title"><div><div class="eyebrow">Most MVP awards</div><h2>Top players</h2></div><span class="small muted">Overall club stats</span></div>
    ${!isSignedIn()?`<div class="empty" style="padding:22px 10px;"><h3>Sign in to view player stats</h3><p>Top player records are available after signing in or registering.</p><button class="btn btn-ball" type="button" onclick="openAuthModal('login')">Sign in</button></div>`:leaders.length?`<div class="club-leaderboard">${leaders.map(row=>`<button type="button" class="club-leader" onclick="openPlayerProfile(${jsArg(row.player.id)},{source:'clubHub',clubId:${jsArg(selected.id)}})"><span class="club-leader-rank">${row.rank}</span>${avatarHTML(row.player,36)}<span class="club-leader-copy"><strong>${esc(row.player.name)}</strong><span>${row.stats.wins}-${row.stats.losses} W/L &middot; ${row.stats.gamesPlayed} games</span></span>${mvpPill(row.mvp)}</button>`).join('')}</div>`:`<div class="empty" style="padding:22px 10px;"><p>No club member has earned an MVP award overall.</p></div>`}
    <div class="divider"></div>
    <div class="section-title"><div><div class="eyebrow">Club directory</div><h2>${esc(selected.name)} members</h2></div><span class="diff-pill diff-zero">${filteredMembers.length}/${selectedMembers.length} shown</span></div>
    <div class="club-role-filters" role="tablist" aria-label="Filter club members by role">${['all','club_admin','co_admin','staff','member'].map(role=>`<button class="club-role-filter ${activeRoleFilter===role?'active':''}" type="button" role="tab" aria-selected="${activeRoleFilter===role?'true':'false'}" onclick="setClubProfileRoleFilter(${jsArg(role)})">${esc(roleFilterLabels[role])} - ${roleFilterCounts[role]||0}</button>`).join('')}</div>
    ${selectedMembers.length?filteredMembers.length?`<div class="club-members-grid compact-directory" style="margin-top:12px;">${filteredMembers.map(player=>renderClubMemberRow(player,selected,{canManage,mvpCounts:selectedMvpCounts})).join('')}</div>`:`<div class="empty"><p>No members match this role filter.</p></div>`:`<div class="empty"><h3>No approved members yet</h3><p>${canManage?'Review pending requests or add an existing CourtRush player.':'This club has not listed members yet.'}</p></div>`}    ${canManage?renderClubAdminPanel(selected,availablePlayers):''}
  </section></div></div>`:''}`;
}

function renderProfileClubDetailModal(){
  const selected=clubById(state.clubHubSelectedId);
  if(!selected) return '';
  const selectedMembers=membersForClub(selected.id);
  const selectedGames=clubMemberMatches(selected.id,false);
  const selectedMvpCounts=computeMvpCounts(false);
  const leaders=clubMvpLeaders(selected.id,false);
  const totalMvp=selectedMembers.reduce((sum,p)=>sum+(selectedMvpCounts[p.id]||0),0);
  const filteredMembers=sortClubMembersByRole(selected.id,selectedMembers);
  return `
  <div class="modal-overlay club-detail-overlay" role="dialog" aria-modal="true" aria-labelledby="profileClubDetailTitle" onclick="if(event.target===this){closeClubHubProfile();}">
  <div class="modal club-detail-modal">
    <button class="modal-close" type="button" onclick="closeClubHubProfile()" aria-label="Close ${esc(selected.name)} club details">&times;</button>
    <div class="club-detail-header section-title"><div><div class="eyebrow">${esc(selected.origin||'Origin unavailable')}</div><h2 id="profileClubDetailTitle">${esc(selected.name)} club profile</h2></div><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><button class="btn btn-primary btn-sm" type="button" onclick="goToClubHubFromProfile(${jsArg(selected.id)})">Go to Club Hub</button><span class="diff-pill diff-zero">Profile view</span></div></div>
    <section id="profileClubProfile">
      <div class="club-profile-summary"><div class="club-profile-stat"><strong>${selectedMembers.length}</strong><span>Club members</span></div><div class="club-profile-stat"><strong>${selectedGames.length}</strong><span>Club Games</span></div><div class="club-profile-stat"><strong>${totalMvp}</strong><span>MVP awards</span></div></div>
      <div class="section-title"><div><div class="eyebrow">Most MVP awards</div><h2>Top players</h2></div><span class="small muted">Overall club stats</span></div>
      ${!isSignedIn()?`<div class="empty" style="padding:22px 10px;"><h3>Sign in to view player stats</h3><p>Top player records are available after signing in or registering.</p><button class="btn btn-ball" type="button" onclick="openAuthModal('login')">Sign in</button></div>`:leaders.length?`<div class="club-leaderboard">${leaders.map(row=>`<button type="button" class="club-leader" onclick="openPlayerProfile(${jsArg(row.player.id)},{source:'clubHub',clubId:${jsArg(selected.id)}})"><span class="club-leader-rank">${row.rank}</span>${avatarHTML(row.player,36)}<span class="club-leader-copy"><strong>${esc(row.player.name)}</strong><span>${row.stats.wins}-${row.stats.losses} W/L &middot; ${row.stats.gamesPlayed} games</span></span>${mvpPill(row.mvp)}</button>`).join('')}</div>`:`<div class="empty" style="padding:22px 10px;"><p>No club member has earned an MVP award overall.</p></div>`}
      <div class="divider"></div>
      <div class="section-title"><div><div class="eyebrow">Club directory</div><h2>${esc(selected.name)} members</h2></div><span class="diff-pill diff-zero">${filteredMembers.length}/${selectedMembers.length} shown</span></div>
      ${selectedMembers.length?`<div class="club-members-grid compact-directory" style="margin-top:12px;">${filteredMembers.map(player=>renderClubMemberRow(player,selected,{canManage:false,mvpCounts:selectedMvpCounts})).join('')}</div>`:`<div class="empty"><h3>No approved members yet</h3><p>This club has not listed members yet.</p></div>`}
    </section>
  </div>
  </div>`;
}

/* ============================= CLUB CHAT ============================= */
function renderClubChat(){
  if(!isSignedIn()) return `<div class="panel"><div class="empty"><h3>Sign in to open Club Chat</h3><p>Only approved members can read and post in their club conversations.</p><button class="btn btn-ball" onclick="openAuthModal('login')">Sign in</button></div></div>`;
  const clubIds=visibleChatClubIds();
  const clubs=clubIds.map(clubById).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name));
  if(!clubs.length) return `<div class="panel"><div class="empty"><h3>No club chats yet</h3><p>Join a club from Club Hub. Its private chat will appear here after your membership is approved.</p><button class="btn btn-ball" onclick="state.clubWorkspaceView='hub';setTab('clubs')">Open Club Hub</button></div></div>`;
  const active=clubs.find(club=>club.id===state.chatClubId)||clubs[0];
  if(state.chatClubId!==active.id) state.chatClubId=active.id;
  markChatRead(active.id);
  const canPost=chatClubIds().includes(active.id);
  const lockedNotice=lockedScheduleChatNotice(active.id);
  const pendingAccess=!!(state.myPlayerId&&pendingJoinRequest(active.id,state.myPlayerId));
  const inviteAccess=!!(state.myPlayerId&&pendingClubInvite(active.id,state.myPlayerId));
  const messages=allChatMessages().filter(message=>message.clubId===active.id&&canViewChatMessage(message)).slice(-150);
  return `<div class="chat-page">
    <aside class="panel"><div class="section-title"><div><div class="eyebrow">Your conversations</div><h2>Club Chats</h2></div><span class="diff-pill diff-zero">${clubs.length}</span></div><p class="small muted" style="margin:-5px 0 14px;">Approved club chats and direct club notices are shown here.</p><div class="chat-club-list">${clubs.map(club=>{const count=allChatMessages().filter(message=>message.clubId===club.id&&canViewChatMessage(message)).length;const unread=unreadMentionCount(club.id);const noticeOnly=!chatClubIds().includes(club.id);const locked=lockedScheduleChatNotice(club.id);return `<button class="chat-club-button ${club.id===active.id?'active':''}" type="button" onclick="selectChatClub(${jsArg(club.id)})"><strong>${esc(club.name)}</strong><span>${locked?'Club request needed':noticeOnly?'Direct club notice':unread?`${unread} unread mention${unread===1?'':'s'}`:count?`${count} recent message${count===1?'':'s'}`:'Start the conversation'}</span>${unread?`<span class="chat-unread-badge" aria-label="${unread} unread mention${unread===1?'':'s'}">${unread}</span>`:''}</button>`;}).join('')}</div></aside>
    <section class="panel chat-room" aria-label="${esc(active.name)} Club Chat">
      <div class="chat-room-head"><div><div class="eyebrow">Members only</div><h2>${esc(active.name)}</h2></div><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;"><span class="club-chip">Club Chat</span>${canClearClubChat(active.id)?`<button class="btn btn-danger btn-sm" type="button" onclick="clearClubChatForAll(${jsArg(active.id)})" ${state.chatClearBusy?'disabled':''}>${state.chatClearBusy?'Clearing...':'Clear Chat for All Members'}</button>`:''}</div></div>
      <div id="clubChatMessages" class="chat-messages" aria-live="polite">${messages.length?messages.map(message=>{const system=message.kind==='system';const mine=!system&&message.senderUid===state.currentUser.uid;const mentioned=messageMentionsMe(message);const blocked=!system&&containsChatProfanity(message.text);const sender=system?{name:message.senderName||clubName(message.clubId)}:state.players.find(player=>player.id===message.senderPlayerId);return `<div class="chat-message ${mine?'mine':''} ${mentioned?'mentioned':''} ${system?'system':''}">${avatarHTML(sender||{name:message.senderName||'Member'},30)}<div class="chat-bubble">${mentioned?'<div class="chat-mention-label">@ Mentioned you</div>':''}<div class="chat-meta">${system?esc(message.senderName||clubName(message.clubId)):(mine?'You':esc(message.senderName||playerName(message.senderPlayerId)))} - ${esc(formatChatTime(message.createdAt))}</div><div class="chat-text">${blocked?'<em>Message hidden for violating the Club Chat language rule.</em>':formatChatMessageText(message)}</div></div></div>`;}).join(''):lockedNotice?`<div class="empty"><h3>Club approval needed</h3><p>You were included in a ${esc(active.name)} Game Plan. Request to join the club before reading its Club Chat notice.</p>${inviteAccess?`<button class="btn btn-ball" type="button" onclick="setTab('profile')">Review club invitation</button>`:pendingAccess?`<span class="club-chip">Request pending</span>`:`<button class="btn btn-ball" type="button" onclick="requestClubJoin(${jsArg(active.id)})">Request to join ${esc(active.name)}</button>`}</div>`:`<div class="empty"><h3>Start the club conversation</h3><p>Coordinate games, share reminders, and keep the chat respectful.</p></div>`}</div>
      ${canPost?`<form class="chat-composer" onsubmit="sendClubChat(event)"><div class="chat-composer-row"><div class="chat-input-wrap"><div id="clubChatMentionMenu" class="mention-menu" role="listbox" aria-label="Club member and role suggestions" hidden></div><textarea id="clubChatMessage" maxlength="500" rows="2" aria-label="Message ${esc(active.name)}" aria-controls="clubChatMentionMenu" aria-autocomplete="list" placeholder="Message ${esc(active.name)}..." oninput="handleChatMessageInput(event)" onkeydown="handleChatMentionKeydown(event)" onblur="setTimeout(closeChatMentionMenu,150)" ${state.chatBusy?'disabled':''}></textarea></div><button class="btn btn-primary" type="submit" ${state.chatBusy?'disabled':''}>${state.chatBusy?'Sending...':'Send'}</button></div><div class="chat-hint"><div class="chat-rule">Community rule: profanity and abusive words in English or Tagalog are not allowed.</div><div class="chat-mention-hint">Type @ to mention a member or role</div></div></form>`:`<div class="chat-composer"><div class="chat-rule">${lockedNotice?'Request club approval before reading this Game Plan notice.':'This is a direct club notice. Accept the invitation before joining the member conversation.'}</div></div>`}
    </section>
  </div>`;
}

/* ============================= ROSTER ============================= */
function rosterRowMatchesSearch(row,query){
  if(!query) return true;
  const p=row.player;
  const haystack=[
    p.name,
    p.email,
    p.playerId,
    ...activePlayerClubIds(p).map(clubName),
    activePlayerClubIds(p).length?'':'No Club'
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(query);
}
function renderRosterPagination(page,totalPages,totalRows,visibleRows){
  if(totalPages<=1) return `<div class="roster-pagination-count">${visibleRows} of ${totalRows} member${totalRows===1?'':'s'}</div>`;
  return `<div class="roster-pagination" aria-label="Club member pages">
    <button class="btn btn-ghost btn-sm" type="button" onclick="setRosterPage(${page-1})" ${page<=1?'disabled':''}>Previous</button>
    <span>Page ${page} of ${totalPages}</span>
    <button class="btn btn-ghost btn-sm" type="button" onclick="setRosterPage(${page+1})" ${page>=totalPages?'disabled':''}>Next</button>
  </div>`;
}
function renderRosterMemberTile(row){
  const p=row.player;
  const primaryClub=renderPlayerTopClubChip(p);
  return `<article class="roster-member-tile" onclick="openPlayerProfile(${jsArg(p.id)})">
    <div class="roster-member-identity">
      ${avatarHTML(p,36)}
      <div class="roster-member-name-wrap">
        <div class="roster-member-name">${rosterPlayerNameHTML(p)}</div>
        ${isSuperAdmin()?`<div class="roster-member-admin-line">${esc(p.email||'No email')}${p.playerId?` &middot; ${esc(p.playerId)}`:''}</div>`:''}
      </div>
    </div>
    <div class="roster-member-clubs">${primaryClub}</div>
    ${isSuperAdmin()?`<div class="roster-member-actions" onclick="event.stopPropagation();">${p.guest?`<button class="btn btn-primary btn-sm" onclick="migrateGuestToRegisteredPlayer(${jsArg(p.id)})">Migrate</button>`:`<button class="btn btn-danger btn-sm" onclick="deletePlayer(${jsArg(p.id)})">Delete</button>`}</div>`:''}
  </article>`;
}
function renderRoster(){
  const mvpCounts=computeMvpCounts();
  const sortKey=ROSTER_SORT_KEYS.has(state.rosterSortKey)?state.rosterSortKey:'clubs';
  const sortDirection=state.rosterSortDirection==='desc'?'desc':'asc';
  const clubFilterOptions=rosterClubFilterOptions();
  const searchQuery=(state.rosterSearchQuery||'').trim().toLowerCase();
  const allRows=state.players.map(player=>({
    player,
    stats:computePlayerStats(player.id),
    mvp:mvpCounts[player.id]||0
  }));
  const rows=sortRosterRows(allRows.filter(row=>(sortKey!=='clubs'||rosterPlayerMatchesClubFilter(row.player))&&rosterRowMatchesSearch(row,searchQuery)));
  const totalPages=Math.max(1,Math.ceil(rows.length/ROSTER_PAGE_SIZE));
  const page=Math.min(Math.max(1,Number(state.rosterPage)||1),totalPages);
  if(page!==state.rosterPage) state.rosterPage=page;
  const visibleRows=rows.slice((page-1)*ROSTER_PAGE_SIZE,page*ROSTER_PAGE_SIZE);
  return `
  <div class="panel">
    <div class="section-title roster-heading">
      <h2>Club Members</h2>
      <label class="roster-search">
        <span class="sr-only">Search club members</span>
        <input type="search" value="${esc(state.rosterSearchQuery||'')}" placeholder="Search members or clubs" aria-label="Search club members" oninput="setRosterSearchQuery(this.value)" />
      </label>
      ${isSuperAdmin() ? `<button class="btn btn-primary btn-sm" onclick="state.showAddPlayer=true; render();">+ Add global player</button>` : ''}
    </div>
    ${state.players.length===0 ? `
      <div class="empty">
        <h3>No players yet</h3>
        <p>${isSuperAdmin() ? 'Add the first global player profile, or register a club in Club Hub.' : 'Club Admins can add members from their own club page in Club Hub.'}</p>
        ${isSuperAdmin() ? `<button class="btn btn-ball" onclick="state.showAddPlayer=true; render();">Add the first global player</button>` : ''}
      </div>` : `
    <div class="roster-toolbar">
      <div class="roster-toolbar-copy">
        <strong>Sort Club Members</strong>
        <span>Stats use ${esc(activeDateRangeLabel())}: ${esc(activeDateRangeSummary())}</span>
      </div>
      <div class="roster-sort-controls">
        <div class="roster-sort-control">
          <label for="rosterSortKey">Sort by</label>
          <select id="rosterSortKey" onchange="setRosterSortKey(this.value)">
            <option value="clubs" ${sortKey==='clubs'?'selected':''}>Clubs</option>
            <option value="games" ${sortKey==='games'?'selected':''}>Games</option>
            <option value="record" ${sortKey==='record'?'selected':''}>W/L record</option>
            <option value="mvp" ${sortKey==='mvp'?'selected':''}>MVP</option>
          </select>
        </div>
        ${sortKey==='clubs'?renderRosterClubFilter(clubFilterOptions):`<div class="roster-sort-control"><label for="rosterSortDirection">Order</label><select id="rosterSortDirection" onchange="setRosterSortDirection(this.value)"><option value="asc" ${sortDirection==='asc'?'selected':''}>Ascending</option><option value="desc" ${sortDirection==='desc'?'selected':''}>Descending</option></select></div>`}
      </div>
    </div>
    ${rows.length?`<div class="roster-results-bar"><span>${rows.length} matching member${rows.length===1?'':'s'}</span>${renderRosterPagination(page,totalPages,rows.length,visibleRows.length)}</div><div class="roster-member-list">${visibleRows.map(renderRosterMemberTile).join('')}</div>${renderRosterPagination(page,totalPages,rows.length,visibleRows.length)}`:`<div class="empty"><h3>No matching members</h3><p>Adjust the search or club filters to show more Club Members.</p><button class="btn btn-ghost" type="button" onclick="selectAllRosterClubFilters(); state.rosterSearchQuery=''; render();">Clear filters</button></div>`}`}
  </div>`;
}


function renderAddPlayerModal(){
  return `
  <div class="modal-overlay" onclick="if(event.target===this){state.showAddPlayer=false; render();}">
    <div class="modal" style="max-width:400px;">
      <button class="modal-close" onclick="state.showAddPlayer=false; render();">&times;</button>
      <h2 style="font-size:24px;color:var(--court-deep);margin-bottom:14px;">Add a player</h2>
      <form onsubmit="submitAddPlayerForm(event)">
        <div class="field">
          <label>Full name</label>
          <input type="text" id="newPlayerName" placeholder="e.g. Jamie Cruz" autofocus />
        </div>
        <button class="btn btn-primary" type="submit" style="width:100%;">Add to Club Members</button>
      </form>
    </div>
  </div>`;
}

function renderProfileGameCards(gameLog, emptyCopy){
  if(!gameLog.length) return `<p class="small muted">${esc(emptyCopy||'No games logged yet.')}</p>`;
  return `<div class="profile-game-grid">
    ${gameLog.map(g=> `
      <article class="profile-game-card">
        <div class="profile-game-card-head">
          <div class="profile-game-head-copy">
            <div class="profile-game-date">${fmtDate(g.date)}</div>
            <div class="profile-game-meta">Game #${g.gameNum} &middot; Court ${esc(g.court||'-')} &middot; ${esc((MODE_META[g.mode]||{short:g.mode}).short)}</div>
          </div>
          <div class="profile-game-score">${g.myScore} &ndash; ${g.oppScore}</div>
        </div>
        <div class="profile-game-details">
          <div class="profile-game-detail"><span class="profile-game-label">Partner</span><span class="profile-game-value">${g.partners.length ? g.partners.map(playerName).map(esc).join(' &amp; ') : '<span class="muted">-</span>'}</span></div>
          <div class="profile-game-detail"><span class="profile-game-label">Opponents</span><span class="profile-game-value">${g.opponents.length ? g.opponents.map(playerName).map(esc).join(' &amp; ') : '<span class="muted">-</span>'}</span></div>
        </div>
        <div class="profile-game-stats">
          <div class="profile-game-stat"><span class="profile-game-stat-label">Game +/-</span>${diffPill(g.diff,0)}</div>
          <div class="profile-game-stat"><span class="profile-game-stat-label">Running +/-</span>${diffPill(g.running,0)}</div>
        </div>
      </article>`).join('')}
  </div>`;
}
function profileGamePlanKey(g){
  return g.scheduleId?`schedule:${g.scheduleId}`:`legacy:${g.date||'unknown'}:${g.startTime||''}:${g.mode||'open'}:${g.gamePlanTitle||''}`;
}
function profileGamePlanGroups(gameLog){
  const groups=new Map();
  (gameLog||[]).slice().reverse().forEach(g=>{
    const key=profileGamePlanKey(g);
    if(!groups.has(key)){
      const sch=g.scheduleId?scheduleById(g.scheduleId):null;
      const modeKey=(sch&&sch.mode)||g.mode||'open';
      const mode=MODE_META[modeKey]||{label:modeKey,short:modeKey};
      groups.set(key,{
        key,
        title:(sch&&sch.title)||g.gamePlanTitle||`${mode.label} Game Plan`,
        date:(sch&&sch.date)||g.date||'',
        startTime:(sch&&sch.startTime)||g.startTime||'',
        venueName:(sch&&sch.venueName)||g.gamePlanVenueName||'',
        clubId:(sch&&sch.clubId)||g.clubId||ACTIVE_CLUB_ID,
        mode,
        games:[],
        diff:0
      });
    }
    const group=groups.get(key);
    group.games.push(g);
    group.diff+=g.diff;
  });
  return [...groups.values()].map(group=>({
    ...group,
    games:group.games.sort((a,b)=>(Number(a.gameNum)||0)-(Number(b.gameNum)||0))
  })).sort((a,b)=>`${b.date}T${b.startTime||'00:00'}`.localeCompare(`${a.date}T${a.startTime||'00:00'}`));
}
function openPlayerProfilePlan(key){
  state.playerProfilePlanKey=key;
  render();
}
function backToPlayerProfilePlans(){
  state.playerProfilePlanKey=null;
  render();
}
function renderProfileGamePlanHistory(gameLog, emptyCopy){
  if(!gameLog.length) return `<p class="small muted">${esc(emptyCopy||'No games logged yet.')}</p>`;
  const groups=profileGamePlanGroups(gameLog);
  const active=state.playerProfilePlanKey?groups.find(group=>group.key===state.playerProfilePlanKey):null;
  if(state.playerProfilePlanKey&&!active) state.playerProfilePlanKey=null;
  if(active){
    return `<button class="link-btn" type="button" onclick="backToPlayerProfilePlans()">&larr; Back to History</button>
      <article class="profile-game-card" style="margin-top:10px;">
        <div class="profile-game-card-head">
          <div class="profile-game-head-copy">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><span class="mode-badge">${esc(active.mode.short)}</span><span class="club-chip">${esc(active.clubId==='independent'?'Independent':clubName(active.clubId))}</span></div>
            <div class="profile-game-date" style="margin-top:10px;">${esc(active.title)}</div>
            <div class="profile-game-meta">${active.date?fmtDate(active.date):'Date unavailable'} &middot; ${formatTime(active.startTime)}${active.venueName?` &middot; ${esc(active.venueName)}`:''}</div>
          </div>
          ${diffPill(active.diff,0)}
        </div>
      </article>
      ${renderProfileGameCards(active.games,'No games are available for this Game Plan.')}`;
  }
  return `<div class="history-plan-list">${groups.map(group=>`<button type="button" class="history-plan-card-button" onclick="openPlayerProfilePlan(${jsArg(group.key)})"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><span class="mode-badge">${esc(group.mode.short)}</span><span class="club-chip">${esc(group.clubId==='independent'?'Independent':clubName(group.clubId))}</span></div><h2 style="margin-top:12px;">${esc(group.title)}</h2><p class="history-plan-meta">${group.date?fmtDate(group.date):'Date unavailable'} &middot; ${formatTime(group.startTime)}${group.venueName?` &middot; ${esc(group.venueName)}`:''}</p><div class="history-mvp-detail">Player running +/-: ${group.diff>0?'+':''}${group.diff} &middot; ${group.games.length} game${group.games.length===1?'':'s'}</div><span class="history-view-link">View games &rarr;</span></button>`).join('')}</div>`;
}

function beginProfileNameEdit(){ state.profileNameEditing=true; render(); }
function cancelProfileNameEdit(){ state.profileNameEditing=false; state.profileNameBusy=false; render(); }
async function saveMyProfileName(ev){
  ev.preventDefault();
  if(!state.currentUser||!state.myPlayerId||state.profileNameBusy) return;
  const input=document.getElementById('myProfileName');
  const name=input?input.value.trim():'';
  if(name.length<2){ toast('Enter a name with at least 2 characters'); return; }
  if(name.length>60){ toast('Keep the name to 60 characters or fewer'); return; }
  state.profileNameBusy=true; render();
  try{
    await Promise.all([
      PLAYERS_COL.doc(state.myPlayerId).update({name,updatedAt:new Date().toISOString()}),
      USERS_COL.doc(state.currentUser.uid).set({displayName:name,updatedAt:new Date().toISOString()},{merge:true})
    ]);
    if(auth.currentUser&&typeof auth.currentUser.updateProfile==='function'){
      try{ await auth.currentUser.updateProfile({displayName:name}); }catch(profileError){ console.warn('Firebase Auth display name was not updated',profileError); }
    }
    state.players=state.players.map(p=>p.id===state.myPlayerId?{...p,name}:p);
    state.currentUser={...state.currentUser,displayName:name};
    state.profileNameEditing=false;
    toast('Profile name updated');
  }catch(e){
    console.error(e);
    toast('Could not update your name. Check your connection or Firestore rules.');
  }
  state.profileNameBusy=false; render();
}

function hasPasswordSignIn(){
  const user=auth.currentUser;
  return !!(user&&Array.isArray(user.providerData)&&user.providerData.some(provider=>provider&&provider.providerId==='password'));
}
function hasGoogleSignIn(){
  const user=auth.currentUser;
  return !!(user&&Array.isArray(user.providerData)&&user.providerData.some(provider=>provider&&provider.providerId==='google.com'));
}
async function saveMyProfilePassword(ev){
  ev.preventDefault();
  const user=auth.currentUser;
  if(!user||state.profilePasswordBusy) return;
  const existingPassword=hasPasswordSignIn();
  const currentEl=document.getElementById('profileCurrentPassword');
  const passwordEl=document.getElementById('profileNewPassword');
  const confirmationEl=document.getElementById('profileConfirmPassword');
  const currentPassword=currentEl?currentEl.value:'';
  const password=passwordEl?passwordEl.value:'';
  const confirmation=confirmationEl?confirmationEl.value:'';
  if(existingPassword&&!currentPassword){ toast('Enter your current password'); return; }
  if(password.length<6){ toast('Use at least 6 characters for your new password'); return; }
  if(password!==confirmation){ toast('The new password and confirmation do not match'); return; }
  if(!user.email){ toast('This Google account does not have an email address available'); return; }
  if(!confirm(existingPassword?'Update your CourtRush password now?':'Set this password for email sign-in to CourtRush?')) return;
  state.profilePasswordBusy=true; render();
  try{
    if(existingPassword){
      const credential=firebase.auth.EmailAuthProvider.credential(user.email,currentPassword);
      await user.reauthenticateWithCredential(credential);
      await user.updatePassword(password);
      toast('Password updated successfully');
    }else{
      if(hasGoogleSignIn()){
        const provider=new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({prompt:'select_account'});
        await user.reauthenticateWithPopup(provider);
      }
      const credential=firebase.auth.EmailAuthProvider.credential(user.email,password);
      await user.linkWithCredential(credential);
      toast('Password set. You can now sign in with Google or email and password.');
    }
  }catch(e){
    console.error(e);
    if(e&&e.code==='auth/wrong-password') toast('Your current password is incorrect');
    else if(e&&e.code==='auth/credential-already-in-use') toast('That email/password sign-in is already linked to another account');
    else if(e&&e.code==='auth/popup-closed-by-user') toast('Google confirmation was cancelled');
    else if(e&&e.code==='auth/weak-password') toast('Choose a stronger password with at least 6 characters');
    else toast(e&&e.message?e.message.replace('Firebase: ',''):'Could not update your password');
  }
  state.profilePasswordBusy=false; render();
}

function renderMyClubMembershipOption(club,player,profileClubIds){
  const joined=profileClubIds.includes(club.id);
  const pending=!!pendingJoinRequest(club.id,player.id);
  const invited=!!pendingClubInvite(club.id,player.id);
  const locked=joined&&isClubAdmin(club.id);
  if(invited){
    return `<article class="my-club-card invite"><div class="my-club-card-head"><div><div class="eyebrow">Invitation received</div><h3>${esc(club.name)}</h3><p class="small muted">${esc(club.origin||'Origin unavailable')} &middot; A Club Admin or Co-Admin invited you.</p></div><span class="invite-alert-dot" aria-label="New club invitation">!</span></div><div class="club-membership-actions"><button class="btn btn-primary btn-sm" type="button" onclick="respondToClubInvite(${jsArg(club.id)},true)" ${state.profileClubBusy?'disabled':''}>Accept</button><button class="btn btn-danger btn-sm" type="button" onclick="respondToClubInvite(${jsArg(club.id)},false)" ${state.profileClubBusy?'disabled':''}>Decline</button></div></article>`;
  }
  if(joined){
    return `<article class="my-club-card"><div class="my-club-card-head"><div><div class="eyebrow">${locked?'Club Admin':'Joined club'}</div><h3>${esc(club.name)}</h3><p class="small muted">${esc(club.origin||'Origin unavailable')}${locked?' &middot; Transfer Club Admin to another linked member before leaving.':''}</p></div>${locked?'<span class="club-chip admin">Admin</span>':'<span class="club-chip">Member</span>'}</div><div class="club-membership-actions"><button class="btn btn-primary btn-sm" type="button" onclick="openProfileClubDetail(${jsArg(club.id)})">View Club</button><button class="btn btn-ghost btn-sm" type="button" onclick="setMyClubMembership(${jsArg(club.id)},false)" ${state.profileClubBusy||locked?'disabled':''}>Leave club</button></div></article>`;
  }
  if(pending){
    return `<article class="my-club-card"><div class="my-club-card-head"><div><div class="eyebrow">Request pending</div><h3>${esc(club.name)}</h3><p class="small muted">${esc(club.origin||'Origin unavailable')} &middot; Awaiting Club Admin approval.</p></div><span class="club-chip">Pending</span></div><button class="btn btn-ghost btn-sm" type="button" onclick="openProfileClubDetail(${jsArg(club.id)})">View Club</button></article>`;
  }
  return `<article class="my-club-card"><div><div class="eyebrow">Available club</div><h3>${esc(club.name)}</h3><p class="small muted">${esc(club.origin||'Origin unavailable')}</p></div><div class="club-membership-actions"><button class="btn btn-primary btn-sm" type="button" onclick="openProfileClubDetail(${jsArg(club.id)})">View Club</button><button class="btn btn-ghost btn-sm" type="button" onclick="setMyClubMembership(${jsArg(club.id)},true)" ${state.profileClubBusy?'disabled':''}>Request to join</button></div></article>`;
}
function renderMyProfile(){
  if(!isSignedIn()) return `
    <div class="panel"><div class="empty"><h3>Sign in to view My Profile</h3><p>Your personal statistics are connected to your registered club player.</p><button class="btn btn-ball" onclick="openAuthModal('login')">Sign in</button></div></div>`;
  if(!state.myPlayerId) return `
    <div class="panel"><div class="empty"><h3>No linked club player</h3><p>This account is signed in, but it is not linked to a Club Members profile yet. Ask an admin to connect the account's playerId.</p><button class="btn btn-ghost" onclick="setTab('roster')">View Club Members</button></div></div>`;
  const p=state.players.find(x=>x.id===state.myPlayerId);
  if(!p) return `<div class="panel"><div class="empty"><h3>Linked profile unavailable</h3><p>The connected club member could not be found. Ask an admin to check this account's player link.</p></div></div>`;
  const s=computePlayerStats(p.id);
  const scouting=scoutingReport(p.id);
  const gameLog=computePlayerGameLog(p.id);
  const mvpCount=computeMvpCounts()[p.id]||0;
  const decided=s.wins+s.losses;
  const winRate=decided ? (s.wins/decided)*100 : 0;
  const recent=gameLog.slice(0,10).reverse();
  const profileClubIds=activePlayerClubIds(p);
  const availableClubs=clubsForDisplay();
  const joinedClubs=availableClubs.filter(club=>profileClubIds.includes(club.id));
  const invitedClubs=availableClubs.filter(club=>pendingClubInvite(club.id,p.id));
  const pendingClubs=availableClubs.filter(club=>!profileClubIds.includes(club.id)&&!pendingClubInvite(club.id,p.id)&&pendingJoinRequest(club.id,p.id));
  const unjoinedClubs=availableClubs.filter(club=>!profileClubIds.includes(club.id)&&!pendingClubInvite(club.id,p.id)&&!pendingJoinRequest(club.id,p.id));
  return `
  <div class="my-profile-page">
    <section class="my-profile-hero">
      <div class="my-profile-person">${avatarHTML(p,72)}<div class="my-profile-person-copy"><div class="eyebrow" style="color:rgba(255,255,255,.65);">My Profile &middot; ${activeDateRangeLabel()}</div><div class="my-profile-name-line"><h1>${esc(p.name)}</h1><span class="my-profile-badge">${esc(playerDivisionLabel(p))}</span></div><p>${esc(activeDateRangeSummary())} &middot; ${profileClubIds.length?profileClubIds.map(clubName).map(esc).join(' &middot; '):'Independent player'}</p>${renderPlayerPrivateMeta(p)}</div></div>
      <div class="my-profile-actions">${!state.profileNameEditing?`<button class="btn btn-sm btn-profile-edit" type="button" onclick="beginProfileNameEdit()">Edit name</button>`:''}</div>
      ${state.profileNameEditing?`<form class="profile-name-editor" onsubmit="saveMyProfileName(event)"><div class="field"><label for="myProfileName">Player name</label><input id="myProfileName" type="text" value="${esc(p.name)}" maxlength="60" autocomplete="name" autofocus ${state.profileNameBusy?'disabled':''}/></div><button class="btn btn-ball btn-sm" type="submit" ${state.profileNameBusy?'disabled':''}>${state.profileNameBusy?'Saving...':'Save name'}</button><button class="btn btn-profile-edit btn-sm" type="button" onclick="cancelProfileNameEdit()" ${state.profileNameBusy?'disabled':''}>Cancel</button></form>`:''}
      <div class="profile-hero-stats" aria-label="Personal statistics">
        <div class="profile-hero-stat"><strong>${s.gamesPlayed}</strong><span>Games played</span></div>
        <div class="profile-hero-stat"><strong>${s.wins}-${s.losses}</strong><span>W - L</span></div>
        <div class="profile-hero-stat"><strong>${winRate.toFixed(0)}%</strong><span>Win rate</span></div>
        <div class="profile-hero-stat"><strong>${s.diffSum>0?'+':''}${s.diffSum}</strong><span>Total +/-</span></div>
        <div class="profile-hero-stat"><strong>${s.avgDiff>0?'+':''}${s.avgDiff.toFixed(1)}</strong><span>Average +/-</span></div>
        <div class="profile-hero-stat"><strong>${s.avgGamesPerWeek.toFixed(1)}</strong><span>Games / week</span></div>
        <div class="profile-hero-stat"><strong>${s.uniqueDays}</strong><span>Play days</span></div>
        <div class="profile-hero-stat"><strong>${mvpCount}</strong><span>MVP awards</span></div>
      </div>
    </section>
    <section class="panel profile-division-panel">
      <div class="section-title"><div><div class="eyebrow">Player level</div><h2>My division</h2></div></div>
      <div class="division-panel-grid">
        <div class="division-select-wrap"><div class="division-select-head"><label for="myProfileDivision" style="margin:0;">Division</label></div><select id="myProfileDivision" onchange="saveProfileDivision(this.value)" ${state.profileDivisionBusy?'disabled':''}>${PLAYER_DIVISIONS.map(item=>`<option value="${esc(item.value)}" ${playerDivisionValue(p)===item.value?'selected':''}>${esc(item.label)}</option>`).join('')}</select></div>
        ${renderDivisionTips(p)}
      </div>
    </section>
    <section class="panel">
      <div class="section-title"><h2>Performance snapshot</h2><span class="small muted">Based on ${activeDateRangeLabel().toLowerCase()} results</span></div>
      <div class="profile-insight-grid">
        <div class="profile-insight"><div class="eyebrow">Recent form</div>${recent.length?`<div class="recent-form">${recent.map(g=>`<span class="form-dot ${g.diff>0?'win':'loss'}" title="${fmtDate(g.date)}: ${g.myScore}-${g.oppScore}">${g.diff>0?'W':'L'}</span>`).join('')}</div>`:'<strong class="muted">No results yet</strong>'}</div>
        <div class="profile-insight"><div class="eyebrow">Best chemistry</div><strong>${scouting.bestPartner?esc(playerName(scouting.bestPartner.id)):'Not enough games'}</strong>${scouting.bestPartner?`<span class="small muted">${scouting.bestPartner.games} games &middot; ${scouting.bestPartner.avg>0?'+':''}${scouting.bestPartner.avg.toFixed(1)} avg +/-</span>`:''}</div>
        <div class="profile-insight"><div class="eyebrow">Toughest opponent</div><strong>${scouting.toughest?esc(playerName(scouting.toughest.id)):'Not enough games'}</strong>${scouting.toughest?`<span class="small muted">${scouting.toughest.games} games &middot; ${scouting.toughest.avg>0?'+':''}${scouting.toughest.avg.toFixed(1)} avg +/-</span>`:''}</div>
      </div>
      <p class="small muted" style="margin:12px 0 0;">${esc(MVP_RULE_TEXT)} Exact ties in both measures produce co-MVPs.</p>
    </section>
    <section class="panel profile-clubs-panel">
      <div class="section-title"><div><div class="eyebrow">My Club</div><h2>Joined clubs</h2></div><button class="btn btn-ghost btn-sm" type="button" onclick="state.clubWorkspaceView='hub';setTab('clubs')">Open Club Hub</button></div>
      ${joinedClubs.length?`<div class="my-club-grid">${joinedClubs.map(club=>renderMyClubMembershipOption(club,p,profileClubIds)).join('')}</div>`:`<div class="empty" style="padding:18px 10px;"><h3>No joined clubs yet</h3><p>Request to join a club below or open Club Hub to review club profiles.</p></div>`}
      ${invitedClubs.length?`<div class="section-title" style="margin:16px 0 10px;"><div><div class="eyebrow">Action needed</div><h2>Club invitations</h2></div><span class="invite-alert-dot" aria-label="${invitedClubs.length} club invitation${invitedClubs.length===1?'':'s'}">${invitedClubs.length}</span></div><div class="my-club-grid">${invitedClubs.map(club=>renderMyClubMembershipOption(club,p,profileClubIds)).join('')}</div>`:''}
      ${(pendingClubs.length||unjoinedClubs.length)?`<div class="section-title" style="margin:16px 0 10px;"><div><div class="eyebrow">Explore</div><h2>Other clubs</h2></div></div><div class="my-club-grid">${[...pendingClubs,...unjoinedClubs].map(club=>renderMyClubMembershipOption(club,p,profileClubIds)).join('')}</div>`:''}
    </section>
    <section class="panel profile-section">
      <div class="section-title"><h2>Detailed game history</h2><span class="small muted">${gameLog.length} game${gameLog.length===1?'':'s'}</span></div>
      <div class="profile-history-range">${renderDateRangePicker(true)}</div>
      ${renderProfileGamePlanHistory(gameLog,'No games are available for this date range.')}
    </section>
  </div>`;
}

function renderProfileSettings(){
  if(!isSignedIn()) return `<div class="panel"><div class="empty"><h3>Sign in to view Settings</h3><p>Profile and device preferences are connected to your CourtRush account.</p><button class="btn btn-ball" onclick="openAuthModal('login')">Sign in</button></div></div>`;
  const p=state.players.find(x=>x.id===state.myPlayerId);
  if(!p) return `<div class="panel"><div class="empty"><h3>No linked club player</h3><p>Settings become available after your account is linked to a Club Members profile.</p><button class="btn btn-ghost" onclick="setTab('roster')">View Club Members</button></div></div>`;
  const passwordEnabled=hasPasswordSignIn();
  return `
  <section class="panel">
    <div class="section-title"><div><div class="eyebrow">Settings</div><h2>Profile &amp; device settings</h2></div><span class="small muted">${isSuperAdmin()?'Administrator':isAnyClubAdmin()?'Club administrator':'Player account'}</span></div>
    <div class="profile-settings-grid">
      <div class="profile-setting"><div class="eyebrow">Detailed profile visibility</div><p class="small muted">Club Members totals remain visible. This controls who can open your detailed performance profile.</p><select aria-label="Detailed profile visibility" onchange="saveProfileVisibility(this.value)" ${state.profileVisibilityBusy?'disabled':''}><option value="public" ${profileVisibilityValue(p)==='public'?'selected':''}>Public - anyone</option><option value="club" ${profileVisibilityValue(p)==='club'?'selected':''}>Shared clubs - fellow members</option><option value="private" ${profileVisibilityValue(p)==='private'?'selected':''}>Private - only me and my Club Admins</option></select></div>
      <div class="profile-setting"><div class="eyebrow">Offline access</div><p class="small muted">Cache club data on this trusted device and queue supported Firestore changes when the connection drops.</p><select aria-label="Offline access on this device" onchange="setOfflineAccessPreference(this.value==='enabled')"><option value="disabled" ${offlineAccessRequested?'':'selected'}>Disabled</option><option value="enabled" ${offlineAccessRequested?'selected':''}>Enabled on this device</option></select></div>
      <div class="profile-setting"><div class="eyebrow">Password &amp; sign-in</div><p class="small muted">${passwordEnabled?'Change your email sign-in password. Your current password is required for confirmation.':'Set a password so this Google account can also sign in with email. Google confirmation will open before it is linked.'}</p><form class="profile-password-form" onsubmit="saveMyProfilePassword(event)">${passwordEnabled?'<div class="field"><label for="profileCurrentPassword">Current password</label><input id="profileCurrentPassword" type="password" autocomplete="current-password" placeholder="********" required/></div>':''}<div class="field"><label for="profileNewPassword">${passwordEnabled?'New password':'Set password'}</label><input id="profileNewPassword" type="password" autocomplete="new-password" minlength="6" placeholder="********" required/></div><div class="field"><label for="profileConfirmPassword">Confirm ${passwordEnabled?'new ':''}password</label><input id="profileConfirmPassword" type="password" autocomplete="new-password" minlength="6" placeholder="********" required/></div><button class="btn btn-primary btn-sm" type="submit" ${state.profilePasswordBusy?'disabled':''}>${state.profilePasswordBusy?'Confirming...':passwordEnabled?'Update password':'Set password'}</button></form></div>
    </div>
  </section>`;
}

function renderManagedClubInvites(player,inviteClubs){
  if(!inviteClubs.length) return '';
  return `<section class="player-club-invites" aria-label="Club invitations"><div class="eyebrow">Invite to one of your clubs</div><div class="player-club-invite-list">${inviteClubs.map(club=>{const membership=clubMembershipRecord(club.id,player.id);const busy=state.clubInviteBusyId===clubMembershipId(club.id,player.id);const pending=membership&&membership.status==='pending';const invited=membership&&membership.status==='invited';const canReviewPending=isAdminForClub(club.id);return `<div class="player-club-invite-row"><div><strong>${esc(club.name)}</strong><span>${pending?'Player requested to join':invited?'Invitation awaiting player response':esc(club.origin||'Origin unavailable')}</span></div>${pending?(canReviewPending?`<button class="btn btn-primary btn-sm" type="button" onclick="state.playerModalId=null;state.clubWorkspaceView='hub';state.clubHubSelectedId=${jsArg(club.id)};setTab('clubs')">Review request</button>`:`<button class="btn btn-ghost btn-sm" type="button" disabled>Request pending</button>`):`<button class="btn ${invited?'btn-ghost':'btn-primary'} btn-sm" type="button" onclick="invitePlayerToClub(${jsArg(club.id)},${jsArg(player.id)})" ${invited||state.clubInviteBusyId?'disabled':''}>${busy?'Sending...':invited?'Invitation sent':'Invite player'}</button>`}</div>`;}).join('')}</div></section>`;
}

function renderPlayerModal(){
  const p = state.players.find(x=>x.id===state.playerModalId);
  if(!p) return '';
  if(!isSignedIn()){
    return `<div class="modal-overlay player-profile-overlay" onclick="if(event.target===this){state.playerModalId=null;render();}"><div class="modal player-profile-modal"><div class="player-profile-sticky-actions"><button class="modal-close" aria-label="Close player profile" onclick="state.playerModalId=null;render();">&times;</button></div><div class="player-profile-header">${avatarHTML(p,64)}<div class="player-profile-header-copy"><div class="eyebrow">Player profile</div><h2 style="font-size:26px;color:var(--court-deep);line-height:1;">${esc(p.name)}</h2><div class="club-chip-list"><span class="my-profile-badge">${esc(playerDivisionLabel(p))}</span></div>${renderPlayerPrivateMeta(p)}</div></div><div class="empty" style="padding-bottom:4px;"><h3>Sign in to view player stats</h3><p>Player profiles and performance details are available only to signed-in CourtRush accounts.</p><div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;"><button class="btn btn-ball" onclick="state.playerModalId=null;openAuthModal('login')">Sign in</button><button class="btn btn-ghost" onclick="state.playerModalId=null;openAuthModal('register')">Register</button></div></div></div></div>`;
  }
  const inviteClubs=managedInviteClubsForPlayer(p);
  const canViewDetails=canViewPlayerProfile(p);
  if(!canViewDetails&&!inviteClubs.length){ state.playerModalId=null; return ''; }
  if(!canViewDetails){
    return `<div class="modal-overlay player-profile-overlay" onclick="if(event.target===this){state.playerModalId=null;render();}"><div class="modal player-profile-modal"><div class="player-profile-sticky-actions"><button class="modal-close" aria-label="Close player profile" onclick="state.playerModalId=null;render();">&times;</button></div><div class="player-profile-header">${avatarHTML(p,64)}<div class="player-profile-header-copy"><div class="eyebrow">Player profile</div><h2 style="font-size:26px;color:var(--court-deep);line-height:1;">${esc(p.name)}</h2><div class="club-chip-list"><span class="my-profile-badge">${esc(playerDivisionLabel(p))}</span>${renderPlayerProfileTopClub(p)}</div>${renderPlayerPrivateMeta(p)}</div></div>${renderManagedClubInvites(p,inviteClubs)}<div class="empty" style="padding-bottom:4px;"><p>This player keeps detailed performance statistics private.</p></div></div></div>`;
  }
  const s = computePlayerStats(p.id);
  const scouting = scoutingReport(p.id);
  const gameLog = computePlayerGameLog(p.id);
  const mvpCount=computeMvpCounts()[p.id]||0;
  const clubHubContext=state.playerModalContext&&state.playerModalContext.source==='clubHub'?state.playerModalContext:null;
  const clubHubMemberDuration=clubHubContext?clubMemberDurationLabel(clubHubContext.clubId,p.id):'';

  return `
  <div class="modal-overlay player-profile-overlay" onclick="if(event.target===this){state.playerModalId=null; render();}">
    <div class="modal player-profile-modal">
      <div class="player-profile-sticky-actions">
        <button class="modal-close" aria-label="Close player profile" onclick="state.playerModalId=null; render();">&times;</button>
      </div>

      <div class="player-profile-header">
        ${avatarHTML(p, 64)}
        <div class="player-profile-header-copy">
          <div class="eyebrow">Player profile - ${activeDateRangeLabel()}</div>
          <h2 style="font-size:26px;color:var(--court-deep);line-height:1;">${esc(p.name)}${p.guest?'<span class="guest-tag">Guest</span>':''}</h2>
          <div class="club-chip-list"><span class="my-profile-badge">${esc(playerDivisionLabel(p))}</span>${renderPlayerProfileTopClub(p)}</div>
          ${renderPlayerPrivateMeta(p)}
          ${clubHubMemberDuration?`<p class="small muted" style="margin:7px 0 0;">${esc(clubHubMemberDuration)}</p>`:""}
        </div>
      </div>

      ${renderManagedClubInvites(p,inviteClubs)}

      <div class="score-tiles" style="margin-top:16px;">
        <div class="score-tile" style="background:var(--bg);border-color:var(--line);">
          <div class="num" style="color:var(--court);">${s.wins}-${s.losses}</div><div class="lbl" style="color:var(--muted);">W - L</div>
        </div>
        <div class="score-tile" style="background:var(--bg);border-color:var(--line);">
          <div class="num" style="color:var(--court);">${s.diffSum>0?'+':''}${s.diffSum}</div><div class="lbl" style="color:var(--muted);">Total +/-</div>
        </div>
        <div class="score-tile" style="background:var(--bg);border-color:var(--line);">
          <div class="num" style="color:var(--court);">${s.avgDiff>0?'+':''}${s.avgDiff.toFixed(1)}</div><div class="lbl" style="color:var(--muted);">Average +/-</div>
        </div>
        <div class="score-tile" style="background:var(--bg);border-color:var(--line);">
          <div class="num" style="color:var(--court);">${s.avgGamesPerWeek.toFixed(1)}</div><div class="lbl" style="color:var(--muted);">Avg weekly games</div>
        </div>
        <div class="score-tile" style="background:rgba(214,230,43,0.16);border-color:rgba(169,184,24,0.35);">
          <div class="num" style="color:var(--court-deep);">${mvpCount}</div><div class="lbl" style="color:var(--muted);">MVP</div>
        </div>
        <div class="score-tile" style="background:var(--bg);border-color:var(--line);">
          <div class="num" style="color:var(--court);">${dailyVisitorCount(p.id)}</div><div class="lbl" style="color:var(--muted);">Daily Visitor</div>
        </div>
      </div>
      <p class="small muted" style="margin:10px 0 0;">${esc(MVP_RULE_TEXT)} Exact ties in both measures produce co-MVPs.</p>

      ${(scouting.toughest || scouting.easiest || scouting.bestPartner) ? `
      <section class="profile-section">
        <div class="divider"></div>
        <div class="eyebrow">Scouting report</div>
        <div class="board-grid" style="margin-top:8px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));">
          ${scouting.toughest ? `<div class="board-row"><span class="board-name">Toughest opponent<div class="board-sub">${esc(playerName(scouting.toughest.id))} - ${scouting.toughest.games}g</div></span>${diffPill(scouting.toughest.avg,1)}</div>` : ''}
          ${scouting.easiest ? `<div class="board-row"><span class="board-name">Easiest opponent<div class="board-sub">${esc(playerName(scouting.easiest.id))} - ${scouting.easiest.games}g</div></span>${diffPill(scouting.easiest.avg,1)}</div>` : ''}
          ${scouting.bestPartner ? `<div class="board-row"><span class="board-name">Best chemistry with<div class="board-sub">${esc(playerName(scouting.bestPartner.id))} - ${scouting.bestPartner.games}g</div></span>${diffPill(scouting.bestPartner.avg,1)}</div>` : ''}
        </div>
      </section>` : ''}

      <section class="profile-section">
        <div class="divider"></div>
        <div class="eyebrow">Game history</div>
        ${renderProfileGamePlanHistory(gameLog,'No games logged yet.')}
      </section>
    </div>
  </div>`;
}

/* ============================= H2H ============================= */
function setH2H(which, id){
  if(which==='a') state.h2hA = id || null;
  else state.h2hB = id || null;
  if(which==='a') state.h2hSearchA = '';
  else state.h2hSearchB = '';
  render();
}
function setH2HSearch(which,value,input){
  const next=String(value||'').trimStart().slice(0,80);
  if(which==='a') state.h2hSearchA=next;
  else state.h2hSearchB=next;
  if(input&&input.value!==next) input.value=next;
  const field=input?input.closest('.field'):null;
  const select=field?field.querySelector('select'):null;
  const query=normalizePlayerSearch(next);
  if(select){
    Array.from(select.options).forEach(option=>{
      if(!option.value) return;
      const match=!query || (option.dataset.playerSearch||'').split(/\s+/).length&&query.split(/\s+/).every(term=>(option.dataset.playerSearch||'').includes(term)) || option.selected;
      option.hidden=!match;
    });
  }
}
function setH2HClub(clubId){
  state.h2hClubId=clubId||'all';
  state.h2hSearchA='';
  state.h2hSearchB='';
  const roster=state.h2hClubId==='all'?state.players:membersForClub(state.h2hClubId);
  if(!roster.some(p=>p.id===state.h2hA)) state.h2hA=null;
  if(!roster.some(p=>p.id===state.h2hB)) state.h2hB=null;
  render();
}
function h2hPlayerOptions(roster,selectedId,query,clubFilter){
  const normalized=normalizePlayerSearch(query);
  const rows=normalized ? roster.filter(p=>p.id===selectedId||playerMatchesRegisteredSearch(p,normalized)) : roster;
  return rows.map(p=>`<option value="${esc(p.id)}" data-player-search="${esc(normalizePlayerSearch(`${p.name||''} ${activePlayerClubIds(p).map(clubName).join(' ')}`))}" ${selectedId===p.id?'selected':''}>${esc(p.name)}${clubFilter==='all'&&activePlayerClubIds(p).length?` - ${activePlayerClubIds(p).map(clubName).map(esc).join(', ')}`:''}</option>`).join('');
}
function h2hSearchMenu(which,roster,selectedId,query,clubFilter){
  const normalized=normalizePlayerSearch(query);
  const shown=normalized ? roster.filter(p=>p.id===selectedId||playerMatchesRegisteredSearch(p,normalized)) : roster.slice(0,12);
  const selected=roster.find(p=>p.id===selectedId);
  const label=selected ? playerName(selectedId) : (query ? `Search: ${query}` : 'Search registered players');
  return `<details class="invite-search-menu" ${query?'open':''}>
    <summary>${esc(label)}</summary>
    <div class="invite-search-options" onclick="event.stopPropagation()">
      <div class="invite-search-field"><input type="search" value="${esc(query||'')}" placeholder="Search registered players..." aria-label="Search ${which==='a'?'Player A':'Player B'}" oninput="setH2HSearch(${jsArg(which)},this.value,this)" onclick="event.stopPropagation()"/></div>
      <div class="guest-search-results">
        ${shown.map(p=>{const clubs=activePlayerClubIds(p);return `<button class="guest-search-option" type="button" onclick="setH2H(${jsArg(which)},${jsArg(p.id)})"><span><strong>${esc(p.name)}</strong><span>${clubFilter==='all'&&clubs.length?clubs.map(clubName).map(esc).join(', '):esc(playerDivisionLabel(p))}</span></span>${playerDivisionBadge(p)}</button>`;}).join('')}
      </div>
      <div class="guest-search-empty" ${normalized&&!shown.length?'':'hidden'}>No registered players found.</div>
    </div>
  </details>`;
}
function renderH2H(){
  const clubFilter=state.h2hClubId||'all';
  const roster = [...(clubFilter==='all'?state.players:membersForClub(clubFilter))].sort((a,b)=> a.name.localeCompare(b.name));
  if(roster.length < 2){
    return `<div class="panel"><div class="section-title"><h2>Head to head</h2></div><div class="field" style="max-width:360px;"><label>Player pool</label><select onchange="setH2HClub(this.value)"><option value="all">All CourtRush players</option>${clubsForDisplay().map(club=>`<option value="${esc(club.id)}" ${clubFilter===club.id?'selected':''}>${esc(club.name)}</option>`).join('')}</select></div><div class="empty"><h3>Need at least two players</h3><p>${clubFilter==='all'?'Add more players to compare head-to-head records.':`${esc(clubName(clubFilter))} needs at least two listed members.`}</p><button class="btn btn-ball" onclick="state.clubWorkspaceView='hub';setTab('clubs')">Open Club Hub</button></div></div>`;
  }
  const a = roster.some(p=>p.id===state.h2hA)?state.h2hA:null;
  const b = roster.some(p=>p.id===state.h2hB)?state.h2hB:null;

  let resultHTML = '';
  if(a && b && a!==b){
    const { asOpp, asTeam, oppMatches } = computeH2H(a,b,clubFilter);
    const nameA = esc(playerName(a)), nameB = esc(playerName(b));
    const playerA=state.players.find(p=>p.id===a),playerB=state.players.find(p=>p.id===b);
    const avgA = asOpp.games ? asOpp.diffSumA/asOpp.games : 0;
    const avgTeam = asTeam.games ? asTeam.diffSum/asTeam.games : 0;
    resultHTML = `
    <div class="panel">
      <div class="h2h-player-strip"><div class="h2h-player-card">${avatarHTML(playerA,48)}<div class="h2h-player-card-copy"><strong>${nameA}</strong><span>${activePlayerClubIds(playerA).map(clubName).map(esc).join(' - ')||'Independent player'}</span></div></div><div class="h2h-versus">VS</div><div class="h2h-player-card">${avatarHTML(playerB,48)}<div class="h2h-player-card-copy"><strong>${nameB}</strong><span>${activePlayerClubIds(playerB).map(clubName).map(esc).join(' - ')||'Independent player'}</span></div></div></div>
      <div class="h2h-series-callout">${asOpp.games===0?'No rivalry result yet - their first confirmed meeting will start the series.':asOpp.aWins===asOpp.bWins?`Series tied ${asOpp.aWins}-${asOpp.bWins}${asOpp.ties?` with ${asOpp.ties} draw${asOpp.ties===1?'':'s'}`:''}.`:`${asOpp.aWins>asOpp.bWins?nameA:nameB} leads the confirmed series ${Math.max(asOpp.aWins,asOpp.bWins)}-${Math.min(asOpp.aWins,asOpp.bWins)}.`}</div>
    </div>
    <div class="panel">
      <div class="eyebrow">Head to head - as opponents</div>
      <div class="score-tiles" style="margin-top:10px;">
        <div class="score-tile" style="background:var(--bg);border-color:var(--line);"><div class="num" style="color:var(--court);">${asOpp.games}</div><div class="lbl" style="color:var(--muted);">Games played</div></div>
        <div class="score-tile" style="background:var(--bg);border-color:var(--line);"><div class="num" style="color:var(--court);">${asOpp.aWins} - ${asOpp.bWins}</div><div class="lbl" style="color:var(--muted);">${nameA} vs ${nameB} wins</div></div>
        <div class="score-tile" style="background:var(--bg);border-color:var(--line);"><div class="num" style="color:var(--court);">${asOpp.diffSumA>0?'+':''}${asOpp.diffSumA}</div><div class="lbl" style="color:var(--muted);">Total +/- (for ${nameA})</div></div>
        <div class="score-tile" style="background:var(--bg);border-color:var(--line);"><div class="num" style="color:var(--court);">${avgA>0?'+':''}${avgA.toFixed(1)}</div><div class="lbl" style="color:var(--muted);">Avg +/- per game</div></div>
      </div>
      ${asOpp.games===0 ? `<p class="small muted" style="margin-top:12px;">They have not played against each other yet.</p>` : `
      <table style="margin-top:14px;">
        <thead><tr><th>Date</th><th>Court</th><th>${nameA}'s team</th><th>${nameB}'s team</th><th>Score</th></tr></thead>
        <tbody>
          ${oppMatches.map(m=>{
            const aInT1 = m.team1.includes(a);
            const aTeam = aInT1 ? m.team1 : m.team2;
            const bTeam = aInT1 ? m.team2 : m.team1;
            const aScore = aInT1 ? m.score1 : m.score2;
            const bScore = aInT1 ? m.score2 : m.score1;
            return `<tr>
              <td class="mono small">${fmtDate(m.date)}</td>
              <td class="mono small">${esc(m.court||'-')}</td>
              <td>${aTeam.map(playerName).map(esc).join(' &amp; ')}</td>
              <td>${bTeam.map(playerName).map(esc).join(' &amp; ')}</td>
              <td class="mono">${aScore} - ${bScore}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`}
    </div>
    <div class="panel">
      <div class="eyebrow">As teammates</div>
      <div class="score-tiles" style="margin-top:10px;">
        <div class="score-tile" style="background:var(--bg);border-color:var(--line);"><div class="num" style="color:var(--court);">${asTeam.games}</div><div class="lbl" style="color:var(--muted);">Games together</div></div>
        <div class="score-tile" style="background:var(--bg);border-color:var(--line);"><div class="num" style="color:var(--court);">${asTeam.wins}-${asTeam.losses}</div><div class="lbl" style="color:var(--muted);">Team W - L</div></div>
        <div class="score-tile" style="background:var(--bg);border-color:var(--line);"><div class="num" style="color:var(--court);">${asTeam.diffSum>0?'+':''}${asTeam.diffSum}</div><div class="lbl" style="color:var(--muted);">Total +/-</div></div>
        <div class="score-tile" style="background:var(--bg);border-color:var(--line);"><div class="num" style="color:var(--court);">${avgTeam>0?'+':''}${avgTeam.toFixed(1)}</div><div class="lbl" style="color:var(--muted);">Avg +/- per game</div></div>
      </div>
      ${asTeam.games===0 ? `<p class="small muted" style="margin-top:12px;">They have not partnered up yet.</p>` : ''}
    </div>`;
  } else if(a && b && a===b){
    resultHTML = `<div class="panel"><p class="small muted">Pick two different players to compare.</p></div>`;
  }

  return `
  <div class="panel">
    <div class="section-title"><div><div class="eyebrow">Data-driven matchup lab</div><h2>Head to head</h2></div><span class="diff-pill diff-zero">${activeDateRangeLabel()}</span></div>
    <p class="small muted" style="margin-top:-6px;">Filter the player pool by club, then compare a rivalry record, point differential, chemistry, and every confirmed meeting.</p>
    <div class="h2h-filter-grid" style="margin-top:14px;">
      <div class="field"><label>Player pool</label><select onchange="setH2HClub(this.value)"><option value="all">All CourtRush players</option>${clubsForDisplay().map(club=>`<option value="${esc(club.id)}" ${clubFilter===club.id?'selected':''}>${esc(club.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Player A</label>
        ${h2hSearchMenu('a',roster,a,state.h2hSearchA,clubFilter)}
      </div>
      <div class="field"><label>Player B</label>
        ${h2hSearchMenu('b',roster,b,state.h2hSearchB,clubFilter)}
      </div>
    </div>
    <p class="small muted" style="margin:0;">Showing ${roster.length} player${roster.length===1?'':'s'} from ${clubFilter==='all'?'all clubs':esc(clubName(clubFilter))}. Results use ${esc(activeDateRangeSummary())}.</p>
  </div>
  ${resultHTML}
  `;
}

function computeTeamStandings(sch){
  if(!sch.teams) return null;
  const keyOf=arr=>[...arr].sort().join('|');
  const table=sch.teams.map(t=>({team:t,key:keyOf(t),wins:0,losses:0,diff:0,games:0}));
  const byKey={}; table.forEach(row=>byKey[row.key]=row);
  const recordedIds=new Set(Object.values(sch.recorded||{}));
  // The schedule's recorded map is the authoritative link. This prevents
  // results from another Game Plan on the same date from entering standings.
  const relevant=state.matches.filter(m=>recordedIds.has(m.id)&&isOfficialMatch(m));
  relevant.filter(m=>m.mode==='tournament').forEach(m=>{
    const k1=keyOf(m.team1),k2=keyOf(m.team2);
    if(byKey[k1]){ byKey[k1].games++; byKey[k1].diff+=(m.score1-m.score2); if(m.score1>m.score2) byKey[k1].wins++; else if(m.score1<m.score2) byKey[k1].losses++; }
    if(byKey[k2]){ byKey[k2].games++; byKey[k2].diff+=(m.score2-m.score1); if(m.score2>m.score1) byKey[k2].wins++; else if(m.score2<m.score1) byKey[k2].losses++; }
  });
  return table.sort((a,b)=>b.wins-a.wins||b.diff-a.diff);
}

function renderParticipantPicker(){
  const clubId=state.scheduleDraft&&state.scheduleDraft.clubId;
  const roster=scheduleBaseRoster(clubId);
  const rosterIds=new Set(roster.map(p=>p.id));
  const selectedOutsiders=clubId&&clubId!=='independent'
    ? Array.from(state.scheduleSelection).map(id=>state.players.find(p=>p.id===id)).filter(p=>p&&!rosterIds.has(p.id))
    : [];
  const search=String(state.scheduleGuestSearch||'').trim().toLowerCase();
  const normalizedSearch=normalizePlayerSearch(state.scheduleGuestSearch);
  const externalPool=scheduleExternalPlayerPool(clubId).filter(p=>!state.scheduleSelection.has(p.id));
  const selCount=state.scheduleSelection.size;
  const selectionScope=clubId&&clubId!=='independent'
    ? `${esc(clubName(clubId))}${selectedOutsiders.length?` plus ${selectedOutsiders.length} invited registered player${selectedOutsiders.length===1?'':'s'}`:''}`
    : 'the CourtRush player directory';
  return `
    <div class="builder-section">
      <div class="flex-between">
        <div>
          <div class="eyebrow">Who's playing</div>
          <div class="small muted">${selCount} player${selCount===1?'':'s'} selected from ${selectionScope}.</div>
        </div>
        <div class="selection-tools">
          <button class="link-btn" type="button" onclick="selectAllSchedulePlayers()">Select all</button>
          <button class="link-btn" type="button" onclick="clearSchedulePlayers()">Clear all</button>
        </div>
      </div>
      ${roster.length===0 ? `<p class="small muted">Add players in Club Members first.</p>` : `
      <div class="chip-grid" style="margin-top:12px;">
        ${roster.map(p=>`<div class="chip ${state.scheduleSelection.has(p.id)?'on':''}" onclick="toggleScheduleSelect(${jsArg(p.id)})">${state.scheduleSelection.has(p.id)?'* ':''}${esc(p.name)}</div>`).join('')}
      </div>`}
      ${clubId&&clubId!=='independent'?`<div class="guest-search-panel">
        <label>Search independent or guest players</label>
        <details class="invite-search-menu" ${state.scheduleGuestSearchOpen||normalizedSearch?'open':''} ontoggle="setScheduleRegisteredSearchOpen(this.open)">
          <summary>${search?`Search: ${esc(state.scheduleGuestSearch)}`:'Search independent or guest players'}</summary>
          <div class="invite-search-options">
            <div class="invite-search-field"><input type="search" id="registeredPlayerSearch" value="${esc(state.scheduleGuestSearch||'')}" placeholder="Search independent or guest players..." aria-label="Search independent or guest players" oninput="applyScheduleRegisteredSearch(this)" onclick="event.stopPropagation()"/></div>
            <div class="guest-search-results">${externalPool.map(p=>{const clubs=activePlayerClubIds(p);const searchLabel=normalizePlayerSearch(`${p.name||''} ${p.guest?'guest':''} ${clubs.map(clubName).join(' ')}`);const visible=playerMatchesRegisteredSearch(p,normalizedSearch);return `<button class="guest-search-option" type="button" data-player-search="${esc(searchLabel)}" ${visible?'':'hidden'} onclick="addRegisteredPlayerToSchedule(${jsArg(p.id)})"><span><strong>${esc(p.name)}${p.guest?'<span class="guest-tag">Guest</span>':''}</strong><span>${p.guest?'Guest':clubs.length?clubs.map(clubName).map(esc).join(', '):'Independent'}</span></span>${p.guest?'':playerDivisionBadge(p)}</button>`;}).join('')}</div>
            <div class="guest-search-empty" data-guest-search-hint ${search?'hidden':''}>Type a player name to invite independent or previous guest players.</div>
            <div class="guest-search-empty" data-guest-search-empty ${normalizedSearch&&!externalPool.some(p=>playerMatchesRegisteredSearch(p,normalizedSearch))?'':'hidden'}>No independent or guest players found outside this club.</div>
          </div>
        </details>
      </div>`:''}
      ${selectedOutsiders.length?`<div class="schedule-selected-outsiders" aria-label="Selected invited players">${selectedOutsiders.map(p=>`<div class="chip on" onclick="toggleScheduleSelect(${jsArg(p.id)})">* ${esc(p.name)}${p.guest?'<span class="guest-tag">Guest</span>':playerDivisionBadge(p)}</div>`).join('')}</div>`:''}
      <div class="guest-optional-row">
        <div class="field"><label>Walk-in / guest</label><input type="text" id="guestQuickAdd" placeholder="Add a guest for this Game Plan"/></div>
        <div class="field"><label>Division</label><select id="guestQuickDivision">${PLAYER_DIVISIONS.map(item=>`<option value="${esc(item.value)}">${esc(item.label)}</option>`).join('')}</select></div>
        <button class="btn btn-ghost btn-sm" type="button" onclick="addGuestForSchedule()">Add &amp; select</button>
      </div>
    </div>`;
}function renderTournamentTeamBuilder(){
  if(!state.scheduleDraft || state.scheduleDraft.mode!=='tournament' || state.scheduleDraft.format!=='doubles') return '';
  return `
    <div class="builder-section">
      <div class="flex-between">
        <div><div class="eyebrow">Fixed teams</div><div class="small muted">Teams remain together for the whole tournament.</div></div>
        <button class="link-btn" type="button" onclick="autoPairTeams()">${state.tournamentTeams?'Shuffle teams':'Auto-pair teams'}</button>
      </div>
      ${!state.tournamentTeams ? `<p class="small muted" style="margin-top:10px;">Select an even number of players, then auto-pair them.</p>` : `
        <div style="margin-top:10px;">
          ${state.tournamentTeams.map((team,i)=>`<div class="team-stage-row">${paddleSVG('var(--court)')} Team ${i+1} - ${team.map(playerName).map(esc).join(' &amp; ')}</div>`).join('')}
          ${state.tournamentLeftover?`<p class="small" style="color:var(--coral);margin-top:8px;">${esc(playerName(state.tournamentLeftover))} is unpaired. Add or remove one player before saving.</p>`:''}
        </div>`}
    </div>`;
}
function renderDuprTeamBuilder(){
  const draft=state.scheduleDraft;
  const roster=[...(draft.clubId&&draft.clubId!=='independent'?membersForClub(draft.clubId):state.players)].sort((a,b)=>a.name.localeCompare(b.name));
  const opts=value=>`<option value="">Select...</option>${roster.map(p=>`<option value="${p.id}" ${value===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}`;
  return `
    <div class="builder-section">
      <div class="eyebrow">DUPR teams</div>
      <p class="small muted" style="margin-top:0;">DUPR is treated as a match category only. Pick the exact sides that will play.</p>
      <div class="field-row">
        <div class="field"><label>Team 1${draft.format==='doubles'?' - Player A':''}</label><select onchange="updateScheduleDraft('duprT1a',this.value,false)">${opts(draft.duprT1a)}</select></div>
        ${draft.format==='doubles'?`<div class="field"><label>Team 1 - Player B</label><select onchange="updateScheduleDraft('duprT1b',this.value,false)">${opts(draft.duprT1b)}</select></div>`:''}
      </div>
      <div class="field-row">
        <div class="field"><label>Team 2${draft.format==='doubles'?' - Player A':''}</label><select onchange="updateScheduleDraft('duprT2a',this.value,false)">${opts(draft.duprT2a)}</select></div>
        ${draft.format==='doubles'?`<div class="field"><label>Team 2 - Player B</label><select onchange="updateScheduleDraft('duprT2b',this.value,false)">${opts(draft.duprT2b)}</select></div>`:''}
      </div>
    </div>`;
}
function gamePlanPreview(draft){
  let players=0,rounds=0,games=0,perPlayer=0;
  if(draft.mode==='open'){
    players=state.scheduleSelection.size;
    rounds=0;
    games=0;
    perPlayer=0;
  }else if(draft.mode==='tournament'){
    const built=buildTournamentForDraft(draft);
    players=built.selectedPlayerIds.length;
    rounds=built.rounds.length;
    games=built.rounds.reduce((n,r)=>n+r.courts.length,0);
    perPlayer=players?games*(draft.format==='singles'?2:4)/players:0;
  }else{
    players=duprSelectedIds(draft).length;
    rounds=1; games=1; perPlayer=1;
  }
  const estimatedFinish=addMinutesToTime(draft.startTime,rounds*Math.max(1,Number(draft.avgGameMinutes)||15));
  return {players,rounds,games,perPlayer,estimatedFinish};
}
function renderGamePlanBuilder(isEdit){
  if(!isSignedIn()) return `<div class="panel"><div class="empty"><h3>Sign in to create a Game Plan</h3><p>CourtRush needs an account so ownership and edit permissions can be enforced.</p><button class="btn btn-ball" onclick="openAuthModal('login')">Sign in</button></div></div>`;
  if(!state.scheduleDraft) state.scheduleDraft=defaultScheduleDraft();
  const d=state.scheduleDraft;
  const preview=gamePlanPreview(d);
  const existing=isEdit?scheduleById(state.activeScheduleId):null;
  const eligibleClubIds=[...new Set([...myClubIds(),...managedClubIds(),...(existing&&existing.clubId?[existing.clubId]:[])])];
  const eligibleClubs=eligibleClubIds.map(clubById).filter(Boolean);
  return `
  <div class="panel">
    <div class="schedule-page-head">
      <div>
        <button class="link-btn" type="button" onclick="backToScheduleList()">&larr; Back to Game Plan</button>
        <h1 style="margin-top:10px;">${isEdit?'Edit Game Plan':'Create Game Plan'}</h1>
        <p class="small muted">Choose the session details and exactly who is playing. CourtRush does not use RSVP, join, leave, or waitlist controls.</p>
      </div>
    </div>
  </div>
  <div class="builder-layout" style="margin-top:16px;">
    <div class="panel" style="margin-top:0;">
      ${existing&&Object.keys(existing.recorded||{}).length?`<div class="form-note" style="margin-bottom:16px;">This plan has recorded results. Metadata can be edited safely; changing the date, players, mode, format, or courts will disconnect old Saved badges while keeping official matches in History.</div>`:''}
      <div class="builder-section">
        <div class="eyebrow">Session details</div>
        <div class="field"><label>Game Plan title - optional</label><input type="text" value="${esc(d.title||'')}" placeholder="e.g. Friday Night Open Play" oninput="updateScheduleDraft('title',this.value,false)"/></div>
        <div class="field"><label>Venue Name &mdash; optional</label><input type="text" maxlength="120" value="${esc(d.venueName||'')}" placeholder="e.g. Sports Complex" oninput="updateScheduleDraft('venueName',this.value,false)"/></div>
        <div class="field"><label>Club</label><select onchange="updateScheduleDraft('clubId',this.value,true)" ${isEdit?'disabled':''}><option value="independent" ${d.clubId==='independent'?'selected':''}>Independent / no club</option>${eligibleClubs.map(club=>`<option value="${esc(club.id)}" ${d.clubId===club.id?'selected':''}>${esc(club.name)}</option>`).join('')}</select>${isEdit?'<div class="small muted" style="margin-top:5px;">A saved Game Plan cannot be moved to another club.</div>':''}</div>
        <div class="field-row">
          <div class="field"><label>Game day</label><input type="date" value="${d.date}" onchange="updateScheduleDraft('date',this.value,true)"/></div>
          <div class="field"><label>Start time</label><input type="time" value="${d.startTime}" onchange="updateScheduleDraft('startTime',this.value,true)"/></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Play mode</label>
            <select onchange="updateScheduleDraft('mode',this.value,true)">
              ${Object.entries(MODE_META).map(([key,meta])=>`<option value="${key}" ${d.mode===key?'selected':''}>${meta.label}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Format</label>
            <select onchange="updateScheduleDraft('format',this.value,true)">
              <option value="doubles" ${d.format==='doubles'?'selected':''}>Doubles (2v2)</option>
              <option value="singles" ${d.format==='singles'?'selected':''}>Singles (1v1)</option>
            </select>
          </div>
        </div>
        <div class="field-row">
          <div class="field"><label>Courts</label><input type="number" min="1" value="${d.mode==='dupr'?1:d.courts}" ${d.mode==='dupr'?'disabled':''} onchange="updateScheduleDraft('courts',this.value,true)"/></div>
          <div class="field"><label>Session length (minutes)</label><input type="number" min="1" value="${d.durationMinutes}" onchange="updateScheduleDraft('durationMinutes',this.value,true)"/></div>
        </div>
        <div class="field"><label>Average minutes / game</label><input type="number" min="1" value="${d.avgGameMinutes}" onchange="updateScheduleDraft('avgGameMinutes',this.value,true)"/></div>
      </div>
      ${d.mode==='dupr'?renderDuprTeamBuilder():renderParticipantPicker()}
      ${renderTournamentTeamBuilder()}
      <div class="builder-section" style="padding-bottom:0;">
        <div class="game-plan-actions">
          <button class="btn btn-ghost" type="button" onclick="backToScheduleList()">Cancel</button>
          <button class="btn btn-primary" type="button" onclick="saveGamePlan()">${isEdit?'Save changes':'Generate Game Plan'}</button>
        </div>
      </div>
    </div>
    <div class="builder-sticky">
      <div class="plan-preview">
        <div class="eyebrow" style="color:rgba(255,255,255,0.65);">Recommended Game Plan</div>
        <h2>${MODE_META[d.mode].label}</h2>
        <div class="preview-metrics">
          <div class="preview-metric"><strong>${preview.rounds}</strong><span>Rounds</span></div>
          <div class="preview-metric"><strong>${preview.games}</strong><span>Games</span></div>
          <div class="preview-metric"><strong>${preview.players}</strong><span>Players</span></div>
          <div class="preview-metric"><strong>${preview.perPlayer?`~${preview.perPlayer.toFixed(1)}`:'-'}</strong><span>Games / player</span></div>
        </div>
        <div class="preview-finish"><span class="small">Estimated finish</span><strong>${preview.estimatedFinish}</strong></div>
      </div>
      <p class="small muted" style="margin:10px 2px 0;">A round is one simultaneous time block. Each occupied court inside that round is one game.</p>
      ${d.mode==='open'?'<p class="small muted" style="margin:8px 2px 0;">Open Play starts with 0 games. After saving, admins add suggested queue-balanced games one block at a time.</p>':''}
    </div>
  </div>`;
}
function renderDuprAppendForm(sch){
  const roster=[...(sch.clubId&&sch.clubId!=='independent'?membersForClub(sch.clubId):state.players)].sort((a,b)=>a.name.localeCompare(b.name));
  const opts=roster.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
  return `
  <div class="panel">
    <div class="section-title"><h2>Add DUPR match</h2></div>
    <p class="small muted" style="margin-top:-6px;">Add another fixed matchup to this Game Plan.</p>
    <div class="field-row">
      <div class="field"><label>Team 1${sch.format==='doubles'?' - Player A':''}</label><select id="dupr_more_t1a"><option value="">Select...</option>${opts}</select></div>
      ${sch.format==='doubles'?`<div class="field"><label>Team 1 - Player B</label><select id="dupr_more_t1b"><option value="">Select...</option>${opts}</select></div>`:''}
    </div>
    <div class="field-row">
      <div class="field"><label>Team 2${sch.format==='doubles'?' - Player A':''}</label><select id="dupr_more_t2a"><option value="">Select...</option>${opts}</select></div>
      ${sch.format==='doubles'?`<div class="field"><label>Team 2 - Player B</label><select id="dupr_more_t2b"><option value="">Select...</option>${opts}</select></div>`:''}
    </div>
    <button class="btn btn-primary" onclick="addDuprMatchToPlan(${jsArg(scheduleDocId(sch))})">Add match</button>
  </div>`;
}

/* ============================= SCHEDULE ============================= */
function gamePlansForScheduleFilter(){
  const today=todayStr();
  let plans=state.schedules.filter(s=>s.status!=='cancelled' && (s.status!=='draft' || canManageSchedule(s)));
  if(state.scheduleFilter==='today') plans=plans.filter(s=>s.date===today);
  else if(state.scheduleFilter==='upcoming') plans=plans.filter(s=>s.date>today);
  else if(state.scheduleFilter==='dates') plans=plans.filter(s=>dateInActiveRange(s.date));
  else plans=state.currentUser ? plans.filter(s=>s.createdBy===state.currentUser.uid) : [];
  if(state.scheduleFilter==='mine'){
    return plans.sort((a,b)=>{
      const aFuture=a.date>=today?0:1,bFuture=b.date>=today?0:1;
      if(aFuture!==bFuture) return aFuture-bFuture;
      return aFuture===0 ? scheduleSortValue(a).localeCompare(scheduleSortValue(b)) : scheduleSortValue(b).localeCompare(scheduleSortValue(a));
    });
  }
  return plans.sort((a,b)=>scheduleSortValue(a).localeCompare(scheduleSortValue(b)));
}
function availableScheduleCourtCounts(plans){
  return [...new Set((plans||[]).map(s=>Math.max(1,Number(s.courts)||1)))].sort((a,b)=>a-b);
}
function filteredGamePlans(plans){
  const source=plans||gamePlansForScheduleFilter();
  if(state.scheduleCourtFilter==='all') return source;
  const count=Number(state.scheduleCourtFilter);
  return source.filter(s=>Math.max(1,Number(s.courts)||1)===count);
}
function renderGamePlanCard(sch){
  const id=scheduleDocId(sch);
  const players=schedulePlayers(sch).length;
  const rounds=scheduleRoundCount(sch);
  const mode=MODE_META[sch.mode]||{label:sch.mode||'Game Plan',short:sch.mode||'Plan'};
  const title=sch.title ? esc(sch.title) : `${esc(mode.label)}`;
  const status=sch.status||'published';
  const canEdit=canManageSchedule(sch)&&!isScheduleClosed(sch);
  const canEnd=canManageSchedule(sch)&&!isScheduleClosed(sch);
  return `
  <article class="game-plan-card">
    <div class="game-plan-card-top">
      <div>
        <div class="game-plan-date">${fmtDate(sch.date)}</div>
        <div class="game-plan-time">${formatTime(sch.startTime)}</div>
      </div>
      <span class="status-badge ${esc(status)}">${esc(scheduleStatusLabel(status))}</span>
    </div>
    <div>
      <span class="mode-badge">${esc(mode.short)}</span>
      <div class="game-plan-title" style="margin-top:10px;">${title}</div>
      <div class="club-chip-list"><span class="club-chip">${esc(sch.clubId&&sch.clubId!=='independent'?clubName(sch.clubId):'Independent')}</span></div>
      ${sch.venueName?`<div class="game-plan-creator">Venue: ${esc(sch.venueName)}</div>`:''}
      <div class="game-plan-creator">Game Plan by ${esc(sch.creatorName||'Club player')}</div>
    </div>
    <div class="game-plan-metrics">
      <div class="game-plan-metric"><strong>${players}</strong><span>Players</span></div>
      <div class="game-plan-metric"><strong>${sch.courts||1}</strong><span>Court${Number(sch.courts)===1?'':'s'}</span></div>
      <div class="game-plan-metric"><strong>${rounds}</strong><span>Round${rounds===1?'':'s'}</span></div>
    </div>
    <div class="game-plan-actions">
      <button class="btn btn-primary btn-sm" onclick="openGamePlan(${jsArg(id)})">View Game Plan</button>
      ${canEdit?`<button class="btn btn-ghost btn-sm" onclick="editGamePlan(${jsArg(id)})">Edit</button>`:''}
      ${canEnd?`<button class="btn btn-end btn-sm" onclick="endGamePlan(${jsArg(id)})">End Plan</button>`:''}
    </div>
  </article>`;
}
function renderScheduleLanding(){
  if(!isSignedIn()) return `
    <div class="panel">
      <div class="schedule-page-head">
        <div><div class="eyebrow">Club court rotation</div><h1>Game Plan</h1><p class="small muted">Sign in with your club account to view published Game Plans and create your own.</p></div>
        <button class="btn btn-primary" onclick="openAuthModal('login')">Sign in</button>
      </div>
    </div>
    <div class="panel"><div class="empty"><h3>Club Game Plans are private</h3><p>Authenticated club players can browse Today, Upcoming, and My Created schedules.</p><button class="btn btn-ball" onclick="openAuthModal('login')">Sign in to continue</button></div></div>`;
  const basePlans=gamePlansForScheduleFilter();
  const courtCounts=availableScheduleCourtCounts(basePlans);
  const plans=filteredGamePlans(basePlans);
  const heading=state.scheduleFilter==='today'?"Today's Game Plans":state.scheduleFilter==='upcoming'?'Upcoming Game Plans':state.scheduleFilter==='dates'?'Selected Date Game Plans':'My Created Game Plans';
  const titleTools=state.scheduleFilter==='dates'?`<div class="schedule-title-tools"><span class="small muted">${esc(activeDateRangeSummary())}</span>${renderScheduleInlineDateSelector()}</div>`:`<span class="small muted">${plans.length} plan${plans.length===1?'':'s'}</span>`;
  return `
  <div class="panel">
    <div class="schedule-page-head">
      <div>
        <div class="eyebrow">Club court rotation</div>
        <h1>Game Plan</h1>
        <p class="small muted">Browse published Game Plans first. The creator selects a fixed participant list-there are no join, leave, RSVP, or waitlist controls.</p>
      </div>
      ${isSignedIn()?`<button class="btn btn-primary" onclick="openCreateGamePlan()">+ Create Game Plan</button>`:`<button class="btn btn-ghost" onclick="openAuthModal('login')">Sign in to create</button>`}
    </div>
    <div class="schedule-filter-tools">
      <div class="schedule-filters">
        <button class="schedule-filter ${state.scheduleFilter==='today'?'active':''}" onclick="setScheduleFilter('today')">Today</button>
        <button class="schedule-filter ${state.scheduleFilter==='upcoming'?'active':''}" onclick="setScheduleFilter('upcoming')">Upcoming</button>
        <button class="schedule-filter ${state.scheduleFilter==='dates'?'active':''}" onclick="setScheduleFilter('dates')">Selected Dates</button>
        <button class="schedule-filter ${state.scheduleFilter==='mine'?'active':''}" onclick="setScheduleFilter('mine')">My Created</button>
      </div>
      <div class="court-count-filter">
        <label for="scheduleCourtFilter">Game Plan courts</label>
        <select id="scheduleCourtFilter" onchange="setScheduleCourtFilter(this.value)">
          <option value="all" ${state.scheduleCourtFilter==='all'?'selected':''}>All court counts</option>
          ${courtCounts.map(count=>`<option value="${count}" ${String(state.scheduleCourtFilter)===String(count)?'selected':''}>${count} court${count===1?'':'s'}</option>`).join('')}
        </select>
      </div>
    </div>
  </div>
  <div class="panel">
    <div class="section-title"><h2>${heading}</h2>${titleTools}</div>
    ${state.scheduleFilter==='mine'&&!isSignedIn()?`<div class="empty"><h3>Sign in to see your Game Plans</h3><p>My Created only shows plans owned by the current account.</p><button class="btn btn-ball" onclick="openAuthModal('login')">Sign in</button></div>`:
      plans.length?`<div class="game-plan-grid">${plans.map(renderGamePlanCard).join('')}</div>`:
      `<div class="empty"><h3>No ${state.scheduleFilter==='today'?'Game Plans today':state.scheduleFilter==='upcoming'?'upcoming Game Plans':state.scheduleFilter==='dates'?'Game Plans in the selected dates':'Game Plans created by you'}</h3><p>${isSignedIn()?'Create a Game Plan and select the players who are attending.':'Sign in to create the club next court rotation.'}</p>${isSignedIn()?`<button class="btn btn-ball" onclick="openCreateGamePlan()">+ Create Game Plan</button>`:''}</div>`}
  </div>`;
}
function renderScheduleView(sch){
  const id=scheduleDocId(sch);
  const players=schedulePlayers(sch);
  const mode=MODE_META[sch.mode]||{label:sch.mode||'Game Plan',short:sch.mode||'Plan'};
  const canManage=canManageSchedule(sch);
  const closed=isScheduleClosed(sch);
  const ended=isScheduleEnded(sch);
  const unplayedCount=scheduleUnplayedGameKeys(sch).length;
  const endedAt=formatDateTimeValue(sch.endedAt||sch.completedAt);
  const endedBy=sch.endedByName||'an authorized organizer';
  const showLeaderboardModal=state.scheduleLeaderboardOpenId===id;
  const canRemoveQueuedPlayers=canManage&&!closed&&sch.mode==='open';
  const addGamesButton=`<button class="btn btn-ball" onclick="addExtraRound(${jsArg(id)})">+ Add Games</button>`;
  return `
  <div class="panel">
    <div class="schedule-page-head">
      <div>
        <button class="link-btn" onclick="backToScheduleList()">&larr; Back to Game Plan</button>
        <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:12px;"><span class="mode-badge">${esc(mode.short)}</span><span class="status-badge ${esc(sch.status||'published')}">${esc(scheduleStatusLabel(sch.status||'published'))}</span></div>
        <h1 style="margin-top:10px;">${esc(sch.title||`${sch.creatorName||'Club'}'s ${mode.label}`)}</h1>
        <p class="small muted">${fmtDate(sch.date)} - ${formatTime(sch.startTime)} - ${esc(sch.clubId&&sch.clubId!=='independent'?clubName(sch.clubId):'Independent')}${sch.venueName?` - ${esc(sch.venueName)}`:''} - Game Plan by ${esc(sch.creatorName||'Club player')}</p>
      </div>
      ${canManage?`<div class="game-plan-actions">
        ${!closed?`<button class="btn btn-ghost btn-sm" onclick="editGamePlan(${jsArg(id)})">Edit</button><button class="btn btn-end btn-sm" onclick="endGamePlan(${jsArg(id)})">End Game Plan</button>`:''}
        <button class="btn btn-danger btn-sm" onclick="deleteGamePlan(${jsArg(id)})">Delete</button>
      </div>`:''}
    </div>
    <div class="plan-summary">
      <div class="plan-summary-item"><strong>${players.length}</strong><span>Players</span></div>
      <div class="plan-summary-item"><strong>${sch.courts||1}</strong><span>Courts</span></div>
      <div class="plan-summary-item"><strong>${scheduleRoundCount(sch)}</strong><span>Rounds</span></div>
      <div class="plan-summary-item"><strong>${scheduleGameCount(sch)}</strong><span>Games</span></div>
    </div>
    ${ended?`<div class="ended-note"><strong>Game Plan ended${endedAt?` ${esc(endedAt)}`:''}.</strong> ${unplayedCount?`${unplayedCount} scheduled game${unplayedCount===1?' was':'s were'} not played because the session ended before every round finished.`:'All scheduled games have saved results.'} Ended by ${esc(endedBy)}.</div>`:''}
    <div class="divider"></div>
    <div class="eyebrow">Playing</div>
    <div class="participant-list">${players.map(pid=>`<span class="participant-pill">${renderSchedulePlayerName(pid)}${canRemoveQueuedPlayers&&playerHasUnplayedScheduleSlot(sch,pid)?`<button class="participant-remove" type="button" title="Remove from remaining unplayed games" aria-label="Remove ${esc(playerName(pid))} from remaining unplayed games" onclick="removePlayerFromScheduleQueue(${jsArg(id)},${jsArg(pid)})">&times;</button>`:''}</span>`).join('')||'<span class="small muted">No players listed.</span>'}</div>
  </div>
  ${sch.mode==='dupr'&&canManage&&!closed?renderDuprAppendForm(sch):''}
  ${canManage&&!closed&&sch.mode==='open'?renderLatePlayerPanel(sch):''}
  <div class="builder-layout" style="margin-top:16px;">
    <div>${renderScheduleResult(sch)}</div>
    <div class="builder-sticky">${renderScheduleLeaderboard(sch,false)}</div>
  </div>
  ${canManage&&!closed&&sch.mode!=='dupr'?`<div class="panel"><div class="game-plan-actions">${addGamesButton}<button class="btn btn-danger" onclick="removeExtraRound(${jsArg(id)})" ${scheduleRoundCount(sch)<=0?'disabled title="No games to remove yet"':''}>- Remove Games</button><button class="btn btn-end" onclick="endGamePlan(${jsArg(id)})">End Game Plan</button></div><p class="small muted" style="margin:8px 0 0;">Add Games suggests one queue-balanced court game at a time. The round number stays put until every court in that round has a game, then the next added game starts the next round. Remove Games removes only the latest unplayed court game. End Game Plan immediately closes the session and marks every remaining game without a saved result as not played.</p></div>`:''}
  ${showLeaderboardModal?renderScheduleLeaderboardModal(sch):''}`;
}
function renderLatePlayerPanel(sch){
  const selected=new Set(schedulePlayers(sch));
  const clubId=sch.clubId||'independent';
  const options=state.players
    .filter(p=>!selected.has(p.id)&&(p.guest||clubId==='independent'||playerIsMemberOfClub(p,clubId)||!playerIsMemberOfClub(p,clubId)))
    .sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'}));
  return `<section class="panel">
    <div class="section-title"><div><div class="eyebrow">Player queue</div><h2>Add player or guest</h2></div><span class="small muted">Saved results stay unchanged</span></div>
    <div class="guest-optional-row">
      <div class="field"><label>Registered player or saved guest</label><select id="lateSchedulePlayer"><option value="">Choose a player or saved guest...</option>${options.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}${p.guest?' - Guest':''} - ${esc(playerDivisionLabel(p))}</option>`).join('')}</select></div>
      <div class="field"><label>New walk-in guest</label><input type="text" id="lateGuestName" placeholder="Guest name"/></div>
      <div class="field"><label>Guest division</label><select id="lateGuestDivision">${PLAYER_DIVISIONS.map(item=>`<option value="${esc(item.value)}">${esc(item.label)}</option>`).join('')}</select></div>
      <button class="btn btn-primary btn-sm" type="button" onclick="addLatePlayerToSchedule(${jsArg(scheduleDocId(sch))})">Add to queue</button>
    </div>
    <p class="small muted" style="margin:10px 0 0;">Guests and registered players join the queue immediately. Any unplayed games are recalculated from the queue, prioritizing players with fewer scheduled games and avoiding immediate repeats when enough players are available.</p>
  </section>`;
}
function renderSchedule(){
  if(state.scheduleScreen==='create') return renderGamePlanBuilder(false);
  if(state.scheduleScreen==='edit'){
    const sch=scheduleById(state.activeScheduleId);
    if(!sch){ state.scheduleScreen='list'; return renderScheduleLanding(); }
    return renderGamePlanBuilder(true);
  }
  if(state.scheduleScreen==='view'){
    const sch=scheduleById(state.activeScheduleId);
    if(!sch){ state.scheduleScreen='list'; return renderScheduleLanding(); }
    return renderScheduleView(sch);
  }
  return renderScheduleLanding();
}
function renderScheduleResult(sch){
  const rounds=Array.isArray(sch.rounds)?sch.rounds:[];
  const compactNameScope=schedulePlayers(sch);
  const totalSlots=scheduleGameCount(sch);
  const recordedCount=scheduleRecordedCount(sch);
  const complete=totalSlots>0&&recordedCount>=totalSlots;
  const standings=sch.mode==='tournament'?computeTeamStandings(sch):null;
  const canManage=canManageSchedule(sch);
  const closed=isScheduleClosed(sch);
  const ended=isScheduleEnded(sch);
  const id=scheduleDocId(sch);
  const courtNumbers=scheduleCourtNumbers(sch);
  const requestedCourt=state.activeCourtFilter==='all'?'all':Number(state.activeCourtFilter);
  const activeCourt=requestedCourt==='all'||courtNumbers.includes(requestedCourt)?requestedCourt:'all';
  const visibleRounds=rounds.map(rd=>({
    ...rd,
    courts:(rd.courts||[]).filter(ct=>activeCourt==='all'||Number(ct.court)===activeCourt)
  })).filter(rd=>rd.courts.length>0);
  const unplayedCount=Math.max(0,totalSlots-recordedCount);
  const allLabel=sch.mode==='dupr'?'All matches':'All courts';
  const itemLabel=sch.mode==='dupr'?'Match':'Court';
  return `
  <div class="panel">
    <div class="section-title">
      <h2>${allLabel}</h2>
      <div class="court-board-filter">
        ${totalSlots?`<span class="diff-pill ${complete?'diff-pos':'diff-zero'}">${ended?`${recordedCount} saved - ${unplayedCount} not played`:`${recordedCount}/${totalSlots} results recorded`}</span>`:''}
        ${courtNumbers.length?`<div class="field"><label for="activeCourtFilter">Show</label><select id="activeCourtFilter" onchange="setActiveCourtFilter(this.value)"><option value="all" ${activeCourt==='all'?'selected':''}>${allLabel}</option>${courtNumbers.map(c=>`<option value="${c}" ${activeCourt===c?'selected':''}>${itemLabel} ${c}</option>`).join('')}</select></div>`:''}
      </div>
    </div>
    ${totalSlots===0?`<p class="small muted">No games have been added to this Game Plan.</p>`:''}
    ${standings&&standings.length?`
      <div class="eyebrow" style="margin-top:6px;">Standings</div>
      <table style="margin-bottom:6px;"><thead><tr><th>Team</th><th>W&nbsp;-&nbsp;L</th><th>+/-</th></tr></thead><tbody>
      ${standings.map(row=>`<tr><td class="name-cell">${renderScheduleTeam(row.team)}</td><td class="mono">${row.wins}-${row.losses}</td><td>${diffPill(row.diff,0)}</td></tr>`).join('')}
      </tbody></table>`:''}
    ${visibleRounds.map(rd=>`
      <div class="round-label">${paddleSVG('var(--court)')} ${sch.mode==='dupr'?'Matches':'Round '+rd.round}</div>
      <div class="court-grid">
        ${(rd.courts||[]).map(ct=>{
          const recKey=`${rd.round}_${ct.court}`;
          const recordedId=(sch.recorded||{})[recKey];
          const recordedMatch=recordedId?state.matches.find(m=>m.id===recordedId):null;
          const lateKey=lateCourtResultKey(id,rd.round,ct.court);
          return `<div class="court-card">
            <div class="court-head"><span>${sch.mode==='dupr'?'MATCH '+ct.court:'COURT '+ct.court}</span>${recordedMatch?verificationBadge(recordedMatch):(ended?`<span class="status-badge completed">Not played</span>`:'')}</div>
            <div class="court-body">
              <div class="team-row">${paddleSVG('#fff')} ${renderScheduleTeam(ct.team1,compactNameScope)}</div>
              <div class="net-line">net</div>
              <div class="team-row">${paddleSVG('#fff')} ${renderScheduleTeam(ct.team2,compactNameScope)}</div>
              ${recordedMatch ? (state.editingResultId===recordedMatch.id ? `
                <div class="score-inputs">
                  <input type="number" min="0" id="edit_res_${rd.round}_${ct.court}_1" value="${Number(recordedMatch.score1)}" aria-label="Correct Team 1 score"/>
                  <span class="score-vs">VS</span>
                  <input type="number" min="0" id="edit_res_${rd.round}_${ct.court}_2" value="${Number(recordedMatch.score2)}" aria-label="Correct Team 2 score"/>
                  <button class="btn btn-ball btn-sm" onclick="updateCourtResult(${jsArg(id)},${jsArg(recordedMatch.id)},${rd.round},${ct.court})">Update Result</button>
                  <button class="btn btn-score-edit btn-sm" onclick="cancelEditCourtResult()">Cancel</button>
                </div>` : `
                <div class="score-inputs">
                  <span style="color:#fff;font-family:'IBM Plex Mono',monospace;font-weight:700;">${recordedMatch.score1} <span class="score-vs">-</span> ${recordedMatch.score2}</span>
                  ${canManage?`<button class="btn btn-score-edit btn-sm" onclick="beginEditCourtResult(${jsArg(id)},${jsArg(recordedMatch.id)})">Edit Result</button>`:''}
                </div>${recordedMatch.disputeReason?`<div class="dispute-note">Dispute: ${esc(recordedMatch.disputeReason)}</div>`:''}${resultReviewActions(recordedMatch)}`) :
                closed?(ended&&canManage?(state.lateResultKey===lateKey?`<div class="score-inputs" style="flex-wrap:wrap;"><input type="number" min="0" id="res_${rd.round}_${ct.court}_1" placeholder="0" aria-label="Late Team 1 score"/><span class="score-vs">VS</span><input type="number" min="0" id="res_${rd.round}_${ct.court}_2" placeholder="0" aria-label="Late Team 2 score"/><button class="btn btn-ball btn-sm" onclick="recordCourtResult(${jsArg(id)},${rd.round},${ct.court},true)">Save Late Result</button><button class="btn btn-score-edit btn-sm" onclick="cancelLateCourtResult()">Cancel</button></div>`:`<div class="score-inputs" style="flex-wrap:wrap;"><span class="small" style="color:rgba(255,255,255,0.82);font-weight:700;">Not played - Game Plan ended.</span><button class="btn btn-score-edit btn-sm" onclick="beginLateCourtResult(${jsArg(id)},${rd.round},${ct.court})">Add Late Result</button></div>`):`<div class="score-inputs"><span class="small" style="color:rgba(255,255,255,0.82);font-weight:700;">Not played - Game Plan cancelled.</span></div>`):
                canManage?`<div class="score-inputs"><input type="number" min="0" id="res_${rd.round}_${ct.court}_1" placeholder="0"/><span class="score-vs">VS</span><input type="number" min="0" id="res_${rd.round}_${ct.court}_2" placeholder="0"/><button class="btn btn-ball btn-sm" onclick="recordCourtResult(${jsArg(id)},${rd.round},${ct.court})">Save</button></div>`:
                `<div class="score-inputs"><span class="small" style="color:rgba(255,255,255,0.7);">Waiting for an admin to put the result.</span></div>`}
            </div>
          </div>`;
        }).join('')}
      </div>
      ${(rd.sitOuts||[]).length?`<div style="margin-top:10px;"><div class="eyebrow">Sitting out this round</div><div class="paddle-stack">${rd.sitOuts.map((pid,i)=>`<div class="paddle-row ${state.myPlayerId===pid?'self-player':''}"><span class="p-order">${i+1}</span>${paddleSVG('var(--court)')}<span class="p-name">${renderSchedulePlayerName(pid)}</span></div>`).join('')}</div></div>`:''}
    `).join('')}
    ${totalSlots>0&&!visibleRounds.length?`<div class="empty"><h3>No games on this court</h3><p>Choose another court or return to ${allLabel.toLowerCase()}.</p></div>`:''}
  </div>`;
}
function renderScheduleInlineDateSelector(){
  return `<form class="schedule-inline-date-form" aria-label="Selected date range" onsubmit="applyCustomDateRange(event)">
    <div class="exact-date-field"><label for="customDateStart">From</label><input id="customDateStart" type="date" value="${esc(state.customDateStart||'')}"/></div>
    <div class="exact-date-field"><label for="customDateEnd">To</label><input id="customDateEnd" type="date" value="${esc(state.customDateEnd||'')}"/></div>
    <button class="btn btn-primary btn-sm" type="submit">Apply</button>
    <button class="btn btn-ghost btn-sm" type="button" onclick="clearCustomDateRange()">Clear</button>
  </form>`;
}
function renderScheduleLeaderboard(sch,full){
  const id=scheduleDocId(sch);
  const rows=computeScheduleLeaderboard(sch);
  const shown=full?rows:rows.slice(0,3);
  const recordedIds=new Set(Object.values((sch&&sch.recorded)||{}));
  const officialMatches=state.matches.filter(m=>recordedIds.has(m.id)&&isOfficialMatch(m));
  const mvp=computeGamePlanMvp(officialMatches);
  const mvpIds=new Set(mvp.leaders.map(row=>row.id));
  const showMvpTrophy=isScheduleEnded(sch)&&mvpIds.size>0;
  const rowHtml=(row,index)=>{
    const player=state.players.find(p=>p.id===row.id);
    const trophy=showMvpTrophy&&mvpIds.has(row.id)?'<span title="MVP">??</span>':'';
    const content=`<span class="game-plan-leaderboard-rank">#${index+1}</span><span class="game-plan-leaderboard-player"><span class="game-plan-leaderboard-name"><span>${esc(playerName(row.id))}</span>${trophy}${player?playerDivisionBadge(player):''}</span><span class="game-plan-leaderboard-stat">${row.wins}-${row.losses} W/L - ${row.diff>0?'+':''}${row.diff} +/- - ${row.winrate.toFixed(0)}% Winrate</span></span>`;
    return full?`<div class="game-plan-leaderboard-row">${content}</div>`:`<button class="game-plan-leaderboard-row clickable" type="button" onclick="openScheduleLeaderboard(${jsArg(id)})">${content}</button>`;
  };
  return `<section class="game-plan-leaderboard" aria-label="Game Plan Leaderboard">
    <div class="eyebrow">Game Plan Leaderboard</div>
    <h2>Top players</h2>
    ${shown.length?`<div class="game-plan-leaderboard-list">${shown.map(rowHtml).join('')}</div>`:`<div class="game-plan-leaderboard-empty">No players are listed in this Game Plan yet.</div>`}
    ${!full&&rows.length>3?`<button class="link-btn" type="button" style="margin-top:12px;" onclick="openScheduleLeaderboard(${jsArg(id)})">View full leaderboard</button>`:''}
    ${!full&&rows.length&&!rows.some(row=>row.games)?`<p class="small muted" style="margin:12px 0 0;">Leaderboard updates when confirmed results are saved.</p>`:''}
  </section>`;
}
function renderScheduleLeaderboardModal(sch){
  return `<div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="scheduleLeaderboardTitle" onclick="if(event.target===this){closeScheduleLeaderboard();}"><div class="modal game-plan-leaderboard-full"><button class="modal-close" type="button" onclick="closeScheduleLeaderboard()" aria-label="Close Game Plan Leaderboard">&times;</button><div class="eyebrow">Game Plan Leaderboard</div><h2 id="scheduleLeaderboardTitle" style="font-size:30px;color:var(--court-deep);line-height:1;margin-top:6px;">Full leaderboard</h2><p class="small muted" style="margin:4px 36px 0 0;">All players in this Game Plan ranked by wins, winrate, and losses.</p>${renderScheduleLeaderboard(sch,true)}</div></div>`;
}

/* ============================= HISTORY ============================= */
function historyGamePlanGroups(useActiveRange=true){
  const groups=new Map();
  const matches=[...(useActiveRange?recordedMatchesInActiveRange():recordedMatchesAllRanges())]
    .sort((a,b)=>{
      const dateCmp=String(b.date||'').localeCompare(String(a.date||''));
      if(dateCmp) return dateCmp;
      const timeCmp=String(b.startTime||'').localeCompare(String(a.startTime||''));
      if(timeCmp) return timeCmp;
      return (Number(a.round)||0)-(Number(b.round)||0) || (Number(a.court)||0)-(Number(b.court)||0);
    });
  matches.forEach(m=>{
    const linkedId=m.scheduleId||null;
    const key=linkedId?`schedule:${linkedId}`:`legacy:${m.date||'unknown'}:${m.startTime||''}:${m.mode||'open'}`;
    if(!groups.has(key)){
      const sch=linkedId?scheduleById(linkedId):null;
      const modeKey=(sch&&sch.mode)||m.mode||'open';
      const mode=MODE_META[modeKey]||{label:modeKey,short:modeKey};
      groups.set(key,{
        key,
        scheduleId:linkedId,
        schedule:sch,
        title:(sch&&sch.title)||m.gamePlanTitle||`${mode.label} Game Plan`,
        venueName:(sch&&sch.venueName)||m.gamePlanVenueName||'',
        clubId:(sch&&sch.clubId)||m.clubId||ACTIVE_CLUB_ID,
        createdBy:(sch&&sch.createdBy)||m.gamePlanCreatedBy||'',
        creatorName:(sch&&sch.creatorName)||m.gamePlanCreatorName||'',
        date:(sch&&sch.date)||m.date||'',
        startTime:(sch&&sch.startTime)||m.startTime||'',
        modeKey,
        mode,
        status:(sch&&sch.status)||'',
        matches:[]
      });
    }
    groups.get(key).matches.push(m);
  });
  return [...groups.values()].map(group=>({
    ...group,
    matches:group.matches.sort((a,b)=>(Number(a.round)||0)-(Number(b.round)||0)||(Number(a.court)||0)-(Number(b.court)||0))
  })).sort((a,b)=>`${b.date}T${b.startTime||'00:00'}`.localeCompare(`${a.date}T${a.startTime||'00:00'}`));
}
function openHistoryGroup(key){ state.historyGroupKey=key; render(); }
function backToHistoryPlans(){ state.historyGroupKey=null; render(); }
function renderHistory(){
  const groups=historyGamePlanGroups();
  const totalGames=groups.reduce((sum,g)=>sum+g.matches.length,0);
  if(totalGames===0){
    state.historyGroupKey=null;
    return `<div class="panel"><div class="empty"><h3>No matches in ${esc(activeDateRangeLabel())}</h3><p>Choose another date range, or record results from a Game Plan.</p><div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;"><button class="btn btn-ghost" onclick="setDateRange('overall')">Show Overall</button><button class="btn btn-ball" onclick="setTab('schedule')">Go to Game Plan</button></div></div></div>`;
  }
  const active=state.historyGroupKey ? groups.find(group=>group.key===state.historyGroupKey) : null;
  if(state.historyGroupKey&&!active) state.historyGroupKey=null;
  if(active){
    const status=active.status;
    const officialMatches=active.matches.filter(isOfficialMatch);
    const mvp=computeGamePlanMvp(officialMatches);
    const mvpLabel=mvp.leaders.length>1?'Co-MVPs':'MVP';
    const mvpDetail=mvpRaceDetail(mvp);
    const historyMvpTrophy=status==='completed'?'?? ':'';
    const canDeleteAny=active.matches.some(m=>isAdminForClub(m.clubId||ACTIVE_CLUB_ID));
    const canDeleteGroup=canManageHistoryGroup(active);
    return `
    <section class="panel history-plan-card">
      <button class="link-btn" type="button" onclick="backToHistoryPlans()">&larr; Back to History</button>
      <div class="history-plan-head" style="margin-top:14px;">
        <div><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><span class="mode-badge">${esc(active.mode.short)}</span><span class="club-chip">${esc(active.clubId==='independent'?'Independent':clubName(active.clubId))}</span>${status?`<span class="status-badge ${esc(status)}">${esc(scheduleStatusLabel(status))}</span>`:''}</div><h2>${esc(active.title)}</h2><p class="history-plan-meta">${active.date?fmtDate(active.date):'Date unavailable'} &middot; ${formatTime(active.startTime)}${active.venueName?` &middot; ${esc(active.venueName)}`:''}${active.creatorName?` &middot; Game Plan by ${esc(active.creatorName)}`:''}</p></div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;"><span class="diff-pill diff-zero">${officialMatches.length}/${active.matches.length} confirmed</span>${canDeleteGroup?`<button class="btn btn-danger btn-sm" type="button" onclick="deleteGamePlanHistory(${jsArg(active.key)})">Delete Game Plan history</button>`:''}</div>
      </div>
      ${mvp.leaders.length?`<div class="history-mvp"><div class="history-mvp-label">${mvpLabel}</div><div class="history-mvp-names">${historyMvpTrophy}${mvp.leaders.map(row=>esc(playerName(row.id))).join(' &amp; ')}</div><div class="history-mvp-detail">${mvpDetail}</div></div>`:`<div class="history-mvp empty"><div class="history-mvp-label">MVP</div><div class="history-mvp-detail">${officialMatches.length?`No award: the best W/L record and the highest total +/- belong to different players. ${mvpDetail}`:'Awaiting a confirmed result before an MVP can be awarded.'}</div></div>`}
      <div class="history-table-wrap" style="margin-top:14px;"><table><thead><tr><th>Round</th><th>Court</th><th>Team 1</th><th>Team 2</th><th>Score</th><th>Status &amp; review</th>${canDeleteAny?'<th></th>':''}</tr></thead><tbody>
        ${active.matches.map(m=>`<tr><td class="mono small">${m.round?`#${esc(m.round)}`:'-'}</td><td class="mono small">${esc(m.court||'-')}</td><td>${(m.team1||[]).map(playerName).map(esc).join(' &amp; ')}</td><td>${(m.team2||[]).map(playerName).map(esc).join(' &amp; ')}</td><td class="mono">${Number(m.score1)} &ndash; ${Number(m.score2)}</td><td>${verificationBadge(m)}${m.disputeReason?`<div class="dispute-note">${esc(m.disputeReason)}</div>`:''}${resultReviewActions(m)}</td>${canDeleteAny?`<td>${isAdminForClub(m.clubId||ACTIVE_CLUB_ID)?`<button class="btn btn-danger btn-sm" onclick="deleteMatch(${jsArg(m.id)})">Delete</button>`:''}</td>`:''}</tr>`).join('')}
      </tbody></table></div>
    </section>`;
  }
  return `
  <div class="panel"><div class="section-title"><h2>History</h2><span class="small muted">${activeDateRangeLabel()} &middot; ${groups.length} Game Plan${groups.length===1?'':'s'} &middot; ${totalGames} recorded game${totalGames===1?'':'s'}</span></div><p class="small muted" style="margin:0;">Choose a Game Plan to review results. Only confirmed results count toward statistics, standings, and MVP awards.</p></div>
  <div class="panel"><div class="history-plan-list">${groups.map(group=>{
    const officialMatches=group.matches.filter(isOfficialMatch);
    const mvp=computeGamePlanMvp(officialMatches);
    const trophy=group.status==='completed'&&mvp.leaders.length?'?? ':'';
    return `<button type="button" class="history-plan-card-button" onclick="openHistoryGroup(${jsArg(group.key)})"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><span class="mode-badge">${esc(group.mode.short)}</span><span class="club-chip">${esc(group.clubId==='independent'?'Independent':clubName(group.clubId))}</span>${group.status?`<span class="status-badge ${esc(group.status)}">${esc(scheduleStatusLabel(group.status))}</span>`:''}</div><h2 style="margin-top:12px;">${esc(group.title)}</h2><p class="history-plan-meta">${group.date?fmtDate(group.date):'Date unavailable'} &middot; ${formatTime(group.startTime)}${group.venueName?` &middot; ${esc(group.venueName)}`:''}</p><div class="history-mvp-detail">${mvp.leaders.length?`${trophy}${mvp.leaders.length>1?'Co-MVPs':'MVP'}: ${mvp.leaders.map(row=>esc(playerName(row.id))).join(' &amp; ')} - ${mvp.leaders.map(row=>`${row.diff>0?'+':''}${row.diff} +/-`).join(', ')}`:(officialMatches.length?'No MVP awarded':'Awaiting confirmation')} &middot; ${officialMatches.length}/${group.matches.length} confirmed</div><span class="history-view-link">View games &rarr;</span></button>`;
  }).join('')}</div></div>`;
}
/* ============================= MISC WIRING ============================= */
function wireTabBodyEvents(){
  if(state.tab==='chat'){
    const chat=document.getElementById('clubChatMessages');
    if(chat) requestAnimationFrame(()=>{ chat.scrollTop=chat.scrollHeight; });
  }
}

/* ============================= INIT ============================= */
(async function init(){
  state.loading = false;
  render();
  registerServiceWorker();
  await offlinePersistenceReady;
  startSync();
})();
function registerServiceWorker(){
  if(!('serviceWorker' in navigator)) return;
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('./service-worker.js').catch(err=>{
      console.warn('Service worker registration failed',err);
    });
  });
}
document.addEventListener('keydown',event=>{
  if(event.key!=='Escape') return;
  if(state.supportPanelOpen){ closeSupportPanel(); return; }
  if(state.playerModalId){ state.playerModalId=null; render(); return; }
  if(state.showAddPlayer){ state.showAddPlayer=false; render(); return; }
  if(state.showAuthModal){ state.showAuthModal=false; render(); return; }
  if(state.clubHubSelectedId){ closeClubHubProfile(); }
});

