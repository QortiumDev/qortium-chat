import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MessageList } from '../../src/MessageList';
import { AvatarLightbox } from '../../src/AvatarLightbox';
import { createTranslator } from '../../src/i18n';
import '../../src/styles.css';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNiYGBgAAAABQABp/uV2QAAAABJRU5ErkJggg==';
window.calls = [];
window.mode = 'ok';
window.qdnRequest = async request => {
  window.calls.push(request);
  if (window.mode === 'fail') throw { message: 'fixture fetch failed' };
  if (request.action === 'GET_CHAT_ATTACHMENT_STREAM_URL') return window.previewType === 'file'
    ? 'data:application/pdf;base64,JVBERg==' : 'data:image/png;base64,' + png;
  if (request.action === 'SAVE_CHAT_ATTACHMENT') return { canceled: window.mode === 'cancel' };
  return true;
};
function Fixture() {
  const [image, setImage] = useState(null);
  const [key, setKey] = useState(0);
  window.resetAttachment = type => { window.previewType = type; setKey(k => k + 1); };
  const t = createTranslator('en');
  const descriptor = {version: 1, encrypted: true, network: 'qortium', codec: 'qenc-v2-direct',
    conversation: {kind: 'direct', otherAddress: 'Bob'}, resource: {service: 'QCHAT_ATTACHMENT_PRIVATE', name: 'Alice', identifier: 'fixture'},
    ciphertext: {algorithm: 'SHA-256', hash: 'a'.repeat(64), size: 1234, transactionSignature: 'fixture'}};
  const message = {sender: 'Alice', recipient: 'Bob', txGroupId: 0, timestamp: Date.now(), signature: 'fixture',
    isText: true, isEncrypted: false, encoding: 'BASE64', data: btoa(JSON.stringify({message: '', attachments: [descriptor]}))};
  const noop = () => {};
  return <><MessageList key={key} messages={[message]} network="qortium" selfAddress="Bob" selfName="Bob"
    avatarProfiles={new Map()} canCompose={false} canRevise={false} initialScrollPosition={undefined}
    olderMessagesError="" olderMessagesLoading={false} olderMessagesReachedStart={true}
    onDelete={noop} onDiscardMessage={noop} onDiscardRevision={noop} onEdit={noop} onLoadOlder={noop}
    onOpenAccount={noop} onOpenAvatar={setImage} onOpenImage={setImage} onReact={noop} onReply={noop}
    onRetryMessage={noop} onRetryRevision={noop} onScrollPositionChange={noop}
    pendingReactionKeys={new Set()} pendingRevisionBySignature={new Map()} pendingSendByLocalId={new Map()}
    qortalResourceActions={[]} qortiumResourceActions={['GET_CHAT_ATTACHMENT_STREAM_URL', 'OPEN_CHAT_ATTACHMENT_VIEWER', 'SAVE_CHAT_ATTACHMENT']}
    scrollChatKey="fixture" sentMessageNonce={0} systemMessages={[]} t={t} unreadDividerCeiling={null}
    unreadDividerTimestamp={null} now={Date.now()}/>
    {image && <AvatarLightbox image={image} onClose={() => setImage(null)} t={t}/>}</>;

}
createRoot(document.getElementById('root')).render(<Fixture/>);
