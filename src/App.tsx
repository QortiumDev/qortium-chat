import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  buildActiveChatsWebSocketUrl,
  buildGroupMessagesWebSocketUrl,
  approveGroupJoinRequest,
  getActiveChats,
  getAccountGroupJoinRequests,
  getAdminGroupJoinRequests,
  getDirectMessages,
  getGroupMembers,
  getGroupMessages,
  getMemberGroups,
  getTransactionStatus,
  getPrivateDirectActiveChats,
  joinGroup,
  searchGroups,
  sendChatMessage,
  sendDirectChatMessage,
} from './coreApi';
import { decodeChatMessage, formatTimestamp, getSenderLabel } from './chatText';
import { getBridgeState, hasAction, qdnRequest } from './qdnRequest';
import { applyDisplaySettings, getDisplaySettingsUpdateFromMessage, getInitialDisplaySettings } from './displaySettings';
import type {
  ActiveChats,
  ActiveDirectChat,
  BridgeState,
  ChatMessage,
  GroupData,
  GroupJoinRequest,
  GroupWithJoinRequests,
  GroupMember,
  QdnSelectedAccount,
} from './types';

type AsyncState<T> =
  | { error?: string; phase: 'idle' | 'loading'; value: T }
  | { error: string; phase: 'error'; value: T }
  | { phase: 'ready'; value: T };

const emptyGroups: GroupData[] = [];
const emptyMembers: GroupMember[] = [];
const emptyMessages: ChatMessage[] = [];
const emptyJoinRequests: GroupJoinRequest[] = [];
const emptyAdminJoinRequests: GroupWithJoinRequests[] = [];
const emptyActiveChats: ActiveChats = { direct: [], groups: [] };

type SelectedChat =
  | {
      group: GroupData;
      kind: 'group';
    }
  | {
      direct: ActiveDirectChat;
      kind: 'direct';
    };

type TrackedTransaction = {
  action: 'approve' | 'join';
  groupId: number;
  groupName: string;
  id: string;
  joiner?: string;
  message: string;
  phase: 'confirmed' | 'failed' | 'pending';
  signature?: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getBridgeErrorMessage(error: unknown, fallback: string) {
  const message = getErrorMessage(error, fallback).replace(
    /^Error invoking remote method 'qdn-app:request': Error: /,
    '',
  );

  if (message.includes('Account request was denied')) {
    return 'Account access was not shared.';
  }

  if (message.includes('QDN write request was denied')) {
    return 'Request was not approved in Qortium Home.';
  }

  return message;
}

function getAccountMessage(error: string, isHomeBridge: boolean) {
  if (error.includes('No account is selected')) {
    return 'Select an account for this tab in Qortium Home.';
  }

  if (error.includes('Account access was not shared')) {
    return 'Share the selected account to join groups or send messages.';
  }

  return isHomeBridge
    ? 'Share the selected account to join groups or send messages.'
    : 'Open in Qortium Home to join groups or send messages.';
}

function createState<T>(value: T): AsyncState<T> {
  return { phase: 'idle', value };
}

function getGroupTitle(group: GroupData) {
  return group.groupName || `Group ${group.groupId}`;
}

function getShortAddress(address: string) {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function getDirectTitle(direct: ActiveDirectChat) {
  return direct.name || getShortAddress(direct.address);
}

function getMemberAddress(member: GroupMember) {
  return member.address || member.member || '';
}

function getMemberLabel(member: GroupMember) {
  const address = getMemberAddress(member);

  return member.primaryName || member.name || (address ? getShortAddress(address) : 'Member');
}

function sortGroups(groups: GroupData[]) {
  return [...groups].sort((first, second) => {
    const firstName = getGroupTitle(first).toLocaleLowerCase();
    const secondName = getGroupTitle(second).toLocaleLowerCase();

    return firstName.localeCompare(secondName);
  });
}

function sortMessages(messages: ChatMessage[]) {
  return [...messages].sort((first, second) => first.timestamp - second.timestamp);
}

function getMessageKey(message: ChatMessage, index = 0) {
  return message.signature || `${message.timestamp}-${message.sender}-${index}`;
}

function mergeMessages(currentMessages: ChatMessage[], nextMessages: ChatMessage[]) {
  const messages = new Map<string, ChatMessage>();

  for (const [index, message] of currentMessages.entries()) {
    messages.set(getMessageKey(message, index), message);
  }

  for (const [index, message] of nextMessages.entries()) {
    messages.set(getMessageKey(message, index), message);
  }

  return sortMessages([...messages.values()]).slice(-100);
}

function parseChatMessages(value: unknown) {
  const parsed = typeof value === 'string' ? JSON.parse(value) as unknown : value;

  return Array.isArray(parsed) ? parsed.filter((message): message is ChatMessage => !!message) : [];
}

function parseActiveChats(value: unknown) {
  const parsed = typeof value === 'string' ? JSON.parse(value) as unknown : value;

  return parsed && typeof parsed === 'object' ? parsed as ActiveChats : emptyActiveChats;
}

function AccountSummary({
  account,
  error,
  isHomeBridge,
  onConnect,
}: {
  account: QdnSelectedAccount | null;
  error: string;
  isHomeBridge: boolean;
  onConnect: () => void;
}) {
  if (account) {
    const label = account.name || getShortAddress(account.address);

    return (
      <div className="account-summary">
        {account.avatarUrl ? (
          <img alt="" className="account-summary__avatar" src={account.avatarUrl} />
        ) : (
          <span className="account-summary__avatar account-summary__avatar--fallback">
            {(account.name || account.address).slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="account-summary__text">
          <strong>{label}</strong>
          <span>{account.address}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="account-connect">
      <p className="muted">{getAccountMessage(error, isHomeBridge)}</p>
      {isHomeBridge ? (
        <button className="button button--secondary" onClick={onConnect} type="button">
          Use selected account
        </button>
      ) : null}
    </div>
  );
}

function GroupList({
  groups,
  joinedIds,
  onSelect,
  selectedGroupId,
}: {
  groups: GroupData[];
  joinedIds: Set<number>;
  onSelect: (group: GroupData) => void;
  selectedGroupId: number | null;
}) {
  if (groups.length === 0) {
    return <p className="empty">No groups found</p>;
  }

  return (
    <div className="group-list">
      {groups.map((group) => (
        <button
          className={`group-row${selectedGroupId === group.groupId ? ' group-row--selected' : ''}`}
          key={group.groupId}
          onClick={() => onSelect(group)}
          type="button"
        >
          <span className="group-row__name">{getGroupTitle(group)}</span>
          <span className="group-row__meta">
            {joinedIds.has(group.groupId) ? 'Joined' : group.isOpen === false ? 'Closed' : 'Open'}
            {typeof group.memberCount === 'number' ? ` / ${group.memberCount.toLocaleString()}` : ''}
          </span>
        </button>
      ))}
    </div>
  );
}

function DirectList({
  activeChats,
  canOpen,
  onSelect,
  selectedAddress,
}: {
  activeChats: ActiveChats;
  canOpen: boolean;
  onSelect: (direct: ActiveDirectChat) => void;
  selectedAddress: string | null;
}) {
  const directs = activeChats.direct ?? [];

  if (directs.length === 0) {
    return <p className="empty">No direct chats</p>;
  }

  return (
    <div className="direct-list">
      {directs.map((direct) => (
        <button
          className={`direct-row${selectedAddress === direct.address ? ' direct-row--selected' : ''}`}
          disabled={!canOpen}
          key={direct.address}
          onClick={() => onSelect(direct)}
          title={canOpen ? 'Open direct chat' : 'Pending Qortium Home direct chat support'}
          type="button"
        >
          <span>{getDirectTitle(direct)}</span>
          <small>{formatTimestamp(direct.timestamp)}</small>
        </button>
      ))}
    </div>
  );
}

function MessageList({ messages }: { messages: ChatMessage[] }) {
  if (messages.length === 0) {
    return <p className="empty">No recent messages</p>;
  }

  return (
    <ol className="message-list">
      {messages.map((message, index) => {
        const decoded = decodeChatMessage(message);
        const signature = getMessageKey(message, index);

        return (
          <li className={`message message--${decoded.kind}`} key={signature}>
            <div className="message__meta">
              <strong>{getSenderLabel(message)}</strong>
              <span>{formatTimestamp(message.timestamp)}</span>
            </div>
            <div className="message__body">{decoded.body || 'Empty message'}</div>
          </li>
        );
      })}
    </ol>
  );
}

function GroupMemberList({ members }: { members: GroupMember[] }) {
  if (members.length === 0) {
    return <p className="empty">No members loaded</p>;
  }

  return (
    <div className="member-list">
      {members.slice(0, 24).map((member) => {
        const address = getMemberAddress(member);

        return (
          <span className="member-chip" key={address || getMemberLabel(member)} title={address}>
            {getMemberLabel(member)}
          </span>
        );
      })}
    </div>
  );
}

export default function App() {
  const [bridge, setBridge] = useState<AsyncState<BridgeState>>(createState({ actions: [], isHomeBridge: false, ui: 'BROWSER_DEV' }));
  const [account, setAccount] = useState<QdnSelectedAccount | null>(null);
  const [accountError, setAccountError] = useState('');
  const [groups, setGroups] = useState<AsyncState<GroupData[]>>(createState(emptyGroups));
  const [groupMembers, setGroupMembers] = useState<AsyncState<GroupMember[]>>(createState(emptyMembers));
  const [accountJoinRequests, setAccountJoinRequests] =
    useState<AsyncState<GroupJoinRequest[]>>(createState(emptyJoinRequests));
  const [adminJoinRequests, setAdminJoinRequests] =
    useState<AsyncState<GroupWithJoinRequests[]>>(createState(emptyAdminJoinRequests));
  const [memberGroups, setMemberGroups] = useState<AsyncState<GroupData[]>>(createState(emptyGroups));
  const [activeChats, setActiveChats] = useState<AsyncState<ActiveChats>>(createState(emptyActiveChats));
  const [messages, setMessages] = useState<AsyncState<ChatMessage[]>>(createState(emptyMessages));
  const [selectedChat, setSelectedChat] = useState<SelectedChat | null>(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [directAddress, setDirectAddress] = useState('');
  const [joinPending, setJoinPending] = useState(false);
  const [approvePendingJoiner, setApprovePendingJoiner] = useState<string | null>(null);
  const [sendPending, setSendPending] = useState(false);
  const [writeError, setWriteError] = useState('');
  const [membersOpen, setMembersOpen] = useState(true);
  const [displaySettings, setDisplaySettings] = useState(getInitialDisplaySettings);
  const [trackedTransactions, setTrackedTransactions] = useState<Record<string, TrackedTransaction>>({});

  const joinedIds = useMemo(
    () => new Set(memberGroups.value.map((group) => group.groupId)),
    [memberGroups.value],
  );
  const sortedGroups = useMemo(() => sortGroups(groups.value), [groups.value]);
  const selectedGroup = selectedChat?.kind === 'group' ? selectedChat.group : null;
  const selectedDirect = selectedChat?.kind === 'direct' ? selectedChat.direct : null;
  const selectedGroupId = selectedGroup?.groupId ?? null;
  const selectedDirectAddress = selectedDirect?.address ?? null;
  const pendingJoinGroupIds = useMemo(
    () => new Set(accountJoinRequests.value.map((request) => request.groupId)),
    [accountJoinRequests.value],
  );
  const pendingTrackedJoinGroupIds = useMemo(
    () =>
      new Set(
        Object.values(trackedTransactions)
          .filter((transaction) => transaction.action === 'join' && transaction.phase === 'pending')
          .map((transaction) => transaction.groupId),
      ),
    [trackedTransactions],
  );
  const adminJoinRequestGroups = useMemo(
    () => new Map(adminJoinRequests.value.map((entry) => [entry.group.groupId, entry])),
    [adminJoinRequests.value],
  );
  const selectedAdminJoinRequests =
    selectedGroupId === null ? [] : adminJoinRequestGroups.get(selectedGroupId)?.joinRequests ?? [];
  const selectedTransactions = Object.values(trackedTransactions).filter(
    (transaction) => selectedGroupId !== null && transaction.groupId === selectedGroupId,
  );
  const selectedChatKey = selectedChat
    ? selectedChat.kind === 'group'
      ? `group:${selectedChat.group.groupId}`
      : `direct:${selectedChat.direct.address}`
    : '';
  const actions = bridge.value.actions;
  const actionsKey = actions.join('\n');
  const canJoinGroup = hasAction(actions, 'JOIN_GROUP');
  const canApproveGroupJoinRequests = hasAction(actions, 'APPROVE_GROUP_JOIN_REQUEST');
  const canSendGroupChat = hasAction(actions, 'SEND_CHAT_MESSAGE');
  const canReadPrivateGroupChat = hasAction(actions, 'SEARCH_PRIVATE_GROUP_CHAT_MESSAGES');
  const canReadPrivateDirectChat = hasAction(actions, 'SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES');
  const canLoadPrivateDirectChats = hasAction(actions, 'GET_PRIVATE_DIRECT_ACTIVE_CHATS');
  const canSendDirectChat = canSendGroupChat;
  const canOpenDirectChat = !!account && (canReadPrivateDirectChat || canSendDirectChat);
  const isJoinedGroup = selectedGroupId !== null && joinedIds.has(selectedGroupId);
  const hasPendingJoinRequest = selectedGroupId !== null && pendingJoinGroupIds.has(selectedGroupId);
  const hasPendingJoinTransaction = selectedGroupId !== null && pendingTrackedJoinGroupIds.has(selectedGroupId);
  const isJoinableGroup =
    selectedGroupId !== null && selectedGroupId > 0 && !isJoinedGroup && !hasPendingJoinRequest && !hasPendingJoinTransaction;
  const canSubmitJoin = !!account && !!selectedGroup && canJoinGroup && isJoinableGroup && !joinPending;
  const canComposeMessage =
    !!account &&
    !!selectedChat &&
    (selectedChat.kind === 'group' ? canSendGroupChat : canSendDirectChat);
  const canSubmitMessage =
    canComposeMessage && draft.trim().length > 0 && !sendPending;
  const accountRequiredLabel = bridge.value.isHomeBridge
    ? 'Share the selected account to use chat actions.'
    : 'Open in Qortium Home to use account-scoped chat actions.';
  const directAccessUnavailableLabel = !account
    ? accountRequiredLabel
    : bridge.value.isHomeBridge
      ? 'Direct chat is not available in this Home build.'
      : 'Open in Qortium Home to use direct chat.';
  const directReadUnavailableLabel = !account
    ? accountRequiredLabel
    : bridge.value.isHomeBridge
      ? 'Direct private chat history is not available in this Home build.'
      : 'Open in Qortium Home to read direct private chat history.';
  const directListUnavailableLabel =
    'Active direct chat listing is unavailable; enter an address to open a direct chat.';
  const directSendUnavailableLabel = !account
    ? accountRequiredLabel
    : bridge.value.isHomeBridge
      ? 'Direct private chat sends are not available in this Home build.'
      : 'Open in Qortium Home to send direct private chats.';
  const groupJoinUnavailableLabel = !account
    ? accountRequiredLabel
    : bridge.value.isHomeBridge
      ? 'Group join is not available in this Home build.'
      : 'Open in Qortium Home to join groups.';
  const groupSendUnavailableLabel = !account
    ? accountRequiredLabel
    : bridge.value.isHomeBridge
      ? 'Group chat send is not available in this Home build.'
      : 'Open in Qortium Home to send group chat messages.';
  const selectedDirectHistoryUnavailable =
    selectedChat?.kind === 'direct' && !canReadPrivateDirectChat;
  const selectedClosedGroupHistoryUnavailable =
    selectedChat?.kind === 'group' && selectedChat.group.isOpen === false && !canReadPrivateGroupChat;

  async function loadGroups(nextSearch = search, actionList = actions) {
    setGroups({ phase: 'loading', value: groups.value });

    try {
      const nextGroups = await searchGroups(nextSearch, actionList);

      setGroups({ phase: 'ready', value: nextGroups });
      if (!selectedChat && nextGroups.length > 0) {
        setSelectedChat({ group: nextGroups[0], kind: 'group' });
      }
    } catch (error) {
      setGroups({
        error: getBridgeErrorMessage(error, 'Unable to load groups.'),
        phase: 'error',
        value: groups.value,
      });
    }
  }

  async function loadGroupMembers(group: GroupData, actionList = actions, options: { quiet?: boolean } = {}) {
    if (!options.quiet) {
      setGroupMembers({ phase: 'loading', value: groupMembers.value });
    }

    try {
      setGroupMembers({ phase: 'ready', value: await getGroupMembers(group.groupId, actionList) });
    } catch (error) {
      setGroupMembers({
        error: getBridgeErrorMessage(error, 'Unable to load group members.'),
        phase: 'error',
        value: groupMembers.value,
      });
    }
  }

  async function loadAccountJoinRequests(
    selectedAccount: QdnSelectedAccount,
    actionList = actions,
    options: { quiet?: boolean } = {},
  ) {
    if (!options.quiet) {
      setAccountJoinRequests({ phase: 'loading', value: accountJoinRequests.value });
    }

    try {
      setAccountJoinRequests({
        phase: 'ready',
        value: await getAccountGroupJoinRequests(selectedAccount.address, actionList),
      });
    } catch (error) {
      setAccountJoinRequests({
        error: getBridgeErrorMessage(error, 'Unable to load pending join requests.'),
        phase: 'error',
        value: accountJoinRequests.value,
      });
    }
  }

  async function loadAdminJoinRequests(
    selectedAccount: QdnSelectedAccount,
    actionList = actions,
    options: { quiet?: boolean } = {},
  ) {
    if (!options.quiet) {
      setAdminJoinRequests({ phase: 'loading', value: adminJoinRequests.value });
    }

    try {
      setAdminJoinRequests({
        phase: 'ready',
        value: await getAdminGroupJoinRequests(selectedAccount.address, actionList),
      });
    } catch (error) {
      setAdminJoinRequests({
        error: getBridgeErrorMessage(error, 'Unable to load group join approvals.'),
        phase: 'error',
        value: adminJoinRequests.value,
      });
    }
  }

  async function loadAccountData(selectedAccount: QdnSelectedAccount, actionList = actions) {
    setMemberGroups({ phase: 'loading', value: memberGroups.value });
    setActiveChats({ phase: 'loading', value: activeChats.value });

    try {
      setMemberGroups({ phase: 'ready', value: await getMemberGroups(selectedAccount.address, actionList) });
    } catch (error) {
      setMemberGroups({
        error: getBridgeErrorMessage(error, 'Unable to load joined groups.'),
        phase: 'error',
        value: memberGroups.value,
      });
    }

    try {
      const nextActiveChats = await getActiveChats(selectedAccount.address, actionList);
      const direct = hasAction(actionList, 'GET_PRIVATE_DIRECT_ACTIVE_CHATS')
        ? await getPrivateDirectActiveChats(actionList)
        : nextActiveChats.direct;

      setActiveChats({ phase: 'ready', value: { ...nextActiveChats, direct } });
    } catch (error) {
      setActiveChats({
        error: getBridgeErrorMessage(error, 'Unable to load active chats.'),
        phase: 'error',
        value: activeChats.value,
      });
    }

    void loadAccountJoinRequests(selectedAccount, actionList);
    void loadAdminJoinRequests(selectedAccount, actionList);
  }

  async function loadMessages(chat: SelectedChat | null, actionList = actions) {
    if (!chat) {
      return;
    }

    setMessages({ phase: 'loading', value: messages.value });

    try {
      if (chat.kind === 'direct' && !hasAction(actionList, 'SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES')) {
        setMessages({ phase: 'ready', value: emptyMessages });
        return;
      }

      if (
        chat.kind === 'group' &&
        chat.group.isOpen === false &&
        !hasAction(actionList, 'SEARCH_PRIVATE_GROUP_CHAT_MESSAGES')
      ) {
        setMessages({ phase: 'ready', value: emptyMessages });
        return;
      }

      const nextMessages =
        chat.kind === 'group'
          ? await getGroupMessages(chat.group, actionList)
          : await getDirectMessages(chat.direct.address, actionList);

      setMessages({ phase: 'ready', value: nextMessages });
    } catch (error) {
      setMessages({
        error: getBridgeErrorMessage(error, 'Unable to load messages.'),
        phase: 'error',
        value: messages.value,
      });
    }
  }

  async function handleJoinGroup() {
    if (!selectedGroup || !canSubmitJoin) {
      return;
    }

    setJoinPending(true);
    setWriteError('');

    try {
      const result = await joinGroup(selectedGroup.groupId);

      trackTransaction({
        action: 'join',
        group: selectedGroup,
        message: selectedGroup.isOpen === false ? 'Join request submitted' : 'Join submitted',
        result,
      });

      if (account) {
        await loadAccountData(account);
      }
      await loadGroupMembers(selectedGroup);
    } catch (error) {
      setWriteError(getBridgeErrorMessage(error, 'Unable to join group.'));
    } finally {
      setJoinPending(false);
    }
  }

  async function handleApproveJoinRequest(request: GroupJoinRequest) {
    if (!selectedGroup || !canApproveGroupJoinRequests || approvePendingJoiner) {
      return;
    }

    setApprovePendingJoiner(request.joiner);
    setWriteError('');

    try {
      const result = await approveGroupJoinRequest(request.groupId, request.joiner);

      trackTransaction({
        action: 'approve',
        group: selectedGroup,
        joiner: request.joiner,
        message: 'Approval submitted',
        result,
      });

      if (account) {
        await loadAdminJoinRequests(account);
      }
    } catch (error) {
      setWriteError(getBridgeErrorMessage(error, 'Unable to approve join request.'));
    } finally {
      setApprovePendingJoiner(null);
    }
  }

  function trackTransaction({
    action,
    group,
    joiner,
    message,
    result,
  }: {
    action: TrackedTransaction['action'];
    group: GroupData;
    joiner?: string;
    message: string;
    result: { transactionSignature?: string };
  }) {
    const id = result.transactionSignature || `${action}:${group.groupId}:${Date.now()}`;

    setTrackedTransactions((current) => ({
      ...current,
      [id]: {
        action,
        groupId: group.groupId,
        groupName: getGroupTitle(group),
        id,
        joiner,
        message: result.transactionSignature ? message : `${message}; waiting for node status`,
        phase: 'pending',
        signature: result.transactionSignature,
      },
    }));
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedChat || !canSubmitMessage) {
      return;
    }

    const message = draft.trim();
    const chat = selectedChat;

    setSendPending(true);
    setWriteError('');

    try {
      if (chat.kind === 'group') {
        await sendChatMessage(chat.group.groupId, message);
      } else {
        await sendDirectChatMessage(chat.direct.address, message);
      }

      setDraft('');
      if (chat.kind === 'direct' && account) {
        await loadAccountData(account);
      }

      await loadMessages(chat);
    } catch (error) {
      setWriteError(getBridgeErrorMessage(error, 'Unable to send chat message.'));
    } finally {
      setSendPending(false);
    }
  }

  function selectGroup(group: GroupData) {
    setWriteError('');
    setSelectedChat({ group, kind: 'group' });
  }

  function selectDirect(direct: ActiveDirectChat) {
    setWriteError('');
    setSelectedChat({ direct, kind: 'direct' });
  }

  function handleOpenDirectChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const address = directAddress.trim();

    if (!address || !canOpenDirectChat) {
      return;
    }

    setWriteError('');
    setSelectedChat({
      direct: {
        address,
      },
      kind: 'direct',
    });
  }

  async function connectSelectedAccount(actionList = actions) {
    try {
      const selectedAccount = await qdnRequest<QdnSelectedAccount>({ action: 'GET_SELECTED_ACCOUNT' });
      setAccount(selectedAccount);
      setAccountError('');
      void loadAccountData(selectedAccount, actionList);
      return selectedAccount;
    } catch (error) {
      setAccount(null);
      setAccountError(getBridgeErrorMessage(error, 'Selected account unavailable.'));
      setMemberGroups({ phase: 'ready', value: emptyGroups });
      setAccountJoinRequests({ phase: 'ready', value: emptyJoinRequests });
      setAdminJoinRequests({ phase: 'ready', value: emptyAdminJoinRequests });
      setActiveChats({ phase: 'ready', value: emptyActiveChats });
      return null;
    }
  }

  async function initializeSession() {
    setBridge({ phase: 'loading', value: bridge.value });
    let nextActions = bridge.value.actions;

    try {
      const nextBridge = await getBridgeState();
      nextActions = nextBridge.actions;
      setBridge({ phase: 'ready', value: nextBridge });
    } catch (error) {
      setBridge({
        error: getBridgeErrorMessage(error, 'Unable to inspect QDN bridge.'),
        phase: 'error',
        value: bridge.value,
      });
    }

    void loadGroups(search, nextActions);
    void connectSelectedAccount(nextActions);
  }

  async function refreshAfterTrackedTransaction(transaction: TrackedTransaction) {
    await loadGroups(search);

    if (account) {
      await loadAccountData(account);
    }

    if (selectedGroup?.groupId === transaction.groupId) {
      await loadGroupMembers(selectedGroup);
    }
  }

  useEffect(() => {
    void initializeSession();
  }, []);

  useEffect(() => {
    applyDisplaySettings(displaySettings);
  }, [displaySettings]);

  useEffect(() => {
    function handleHostMessage(event: MessageEvent) {
      setDisplaySettings((current) => getDisplaySettingsUpdateFromMessage(event.data, current) ?? current);
    }

    window.addEventListener('message', handleHostMessage);

    return () => window.removeEventListener('message', handleHostMessage);
  }, []);

  useEffect(() => {
    const pendingTransactions = Object.values(trackedTransactions).filter(
      (transaction) => transaction.phase === 'pending' && transaction.signature,
    );

    if (pendingTransactions.length === 0) {
      return undefined;
    }

    let isDisposed = false;

    async function checkPendingTransactions() {
      for (const transaction of pendingTransactions) {
        if (!transaction.signature) {
          continue;
        }

        try {
          const status = await getTransactionStatus(transaction.signature);

          if (isDisposed) {
            return;
          }

          if (typeof status.blockHeight === 'number' && status.blockHeight > 0) {
            setTrackedTransactions((current) => ({
              ...current,
              [transaction.id]: {
                ...transaction,
                message: transaction.action === 'approve' ? 'Approval confirmed' : 'Join transaction confirmed',
                phase: 'confirmed',
              },
            }));
            void refreshAfterTrackedTransaction(transaction);
          }
        } catch (error) {
          if (isDisposed) {
            return;
          }

          const message = getBridgeErrorMessage(error, 'Unable to check transaction status.');

          if (!/TRANSACTION_UNKNOWN|transaction unknown|HTTP 404/i.test(message)) {
            setTrackedTransactions((current) => ({
              ...current,
              [transaction.id]: {
                ...transaction,
                message,
                phase: 'failed',
              },
            }));
          }
        }
      }
    }

    void checkPendingTransactions();
    const interval = window.setInterval(() => {
      void checkPendingTransactions();
    }, 5000);

    return () => {
      isDisposed = true;
      window.clearInterval(interval);
    };
  }, [Object.values(trackedTransactions).map((transaction) => `${transaction.id}:${transaction.phase}`).join('|')]);

  useEffect(() => {
    if (!selectedChat) {
      setMessages({ phase: 'ready', value: emptyMessages });
      setGroupMembers({ phase: 'ready', value: emptyMembers });
      return undefined;
    }

    if (selectedChat.kind === 'group') {
      void loadGroupMembers(selectedChat.group);
    } else {
      setGroupMembers({ phase: 'ready', value: emptyMembers });
    }

    if (selectedChat.kind !== 'group' || selectedChat.group.isOpen === false) {
      void loadMessages(selectedChat);
      return undefined;
    }

    const chat = selectedChat;
    const socket = new WebSocket(buildGroupMessagesWebSocketUrl(chat.group.groupId));
    let receivedInitialMessages = false;

    setMessages({ phase: 'loading', value: messages.value });

    socket.addEventListener('message', (event) => {
      try {
        const nextMessages = parseChatMessages(event.data);

        if (!receivedInitialMessages) {
          receivedInitialMessages = true;
          setMessages({ phase: 'ready', value: sortMessages(nextMessages) });
          return;
        }

        setMessages((current) => ({
          phase: 'ready',
          value: mergeMessages(current.value, nextMessages),
        }));
      } catch (error) {
        setMessages({
          error: getBridgeErrorMessage(error, 'Unable to read live chat messages.'),
          phase: 'error',
          value: messages.value,
        });
      }
    });

    socket.addEventListener('error', () => {
      if (!receivedInitialMessages) {
        void loadMessages(chat);
      }
    });

    socket.addEventListener('close', () => {
      if (!receivedInitialMessages) {
        void loadMessages(chat);
      }
    });

    return () => socket.close();
  }, [selectedChatKey, actionsKey]);

  useEffect(() => {
    if (!account) {
      return undefined;
    }

    const socket = new WebSocket(buildActiveChatsWebSocketUrl(account.address));

    socket.addEventListener('message', (event) => {
      try {
        const nextActiveChats = parseActiveChats(event.data);

        setActiveChats((current) => ({
          phase: 'ready',
          value: {
            ...current.value,
            groups: nextActiveChats.groups ?? current.value.groups,
          },
        }));
      } catch {
        // Keep the last active-chat snapshot.
      }
    });

    return () => socket.close();
  }, [account?.address]);

  useEffect(() => {
    if (!account) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      void loadAccountJoinRequests(account, actions, { quiet: true });
      void loadAdminJoinRequests(account, actions, { quiet: true });
    }, 30000);

    return () => window.clearInterval(interval);
  }, [account?.address, actionsKey]);

  useEffect(() => {
    if (!selectedGroup) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      void loadGroupMembers(selectedGroup, actions, { quiet: true });
    }, 30000);

    return () => window.clearInterval(interval);
  }, [selectedGroupId, actionsKey]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar__title">
          <h1>Qortium Chat</h1>
        </div>
        <div className="topbar__account">
          <AccountSummary
            account={account}
            error={accountError}
            isHomeBridge={bridge.value.isHomeBridge}
            onConnect={() => void connectSelectedAccount()}
          />
        </div>
      </header>

      <section className={`layout${selectedGroup && membersOpen ? ' layout--members-open' : ''}`}>
        <aside className="sidebar" aria-label="Navigation">
          <section className="panel">
            <div className="panel__header">
              <h2>Groups</h2>
              <span>{groups.value.length}</span>
            </div>
            <form
              className="search"
              onSubmit={(event) => {
                event.preventDefault();
                void loadGroups(search);
              }}
            >
              <input
                aria-label="Search groups"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search groups"
                value={search}
              />
              <button className="button" type="submit">
                Search
              </button>
            </form>
            {groups.phase === 'error' ? <p className="error">{groups.error}</p> : null}
            <GroupList
              groups={sortedGroups}
              joinedIds={joinedIds}
              onSelect={selectGroup}
              selectedGroupId={selectedGroupId}
            />
          </section>

          <section className="panel">
            <div className="panel__header">
              <h2>Direct</h2>
              <span>{activeChats.value.direct?.length ?? 0}</span>
            </div>
            <form className="search" onSubmit={handleOpenDirectChat}>
              <input
                aria-label="Direct address"
                disabled={!canOpenDirectChat}
                onChange={(event) => setDirectAddress(event.target.value)}
                placeholder="Direct address"
                value={directAddress}
              />
              <button
                className="button"
                disabled={!canOpenDirectChat || !directAddress.trim()}
                title={canOpenDirectChat ? 'Open direct chat' : directAccessUnavailableLabel}
                type="submit"
              >
                Open
              </button>
            </form>
            {activeChats.phase === 'error' ? <p className="error">{activeChats.error}</p> : null}
            {!canOpenDirectChat ? <p className="muted">{directAccessUnavailableLabel}</p> : null}
            {canOpenDirectChat && !canLoadPrivateDirectChats ? <p className="muted">{directListUnavailableLabel}</p> : null}
            <DirectList
              activeChats={activeChats.value}
              canOpen={canOpenDirectChat}
              onSelect={selectDirect}
              selectedAddress={selectedDirectAddress}
            />
          </section>
        </aside>

        <section className="chat-pane" aria-label="Selected chat">
          <div className="chat-pane__header">
            <div>
              <h2>
                {selectedChat
                  ? selectedChat.kind === 'group'
                    ? getGroupTitle(selectedChat.group)
                    : getDirectTitle(selectedChat.direct)
                  : 'Select a chat'}
              </h2>
              {selectedChat?.kind === 'group' ? (
                <p>
                  {selectedChat.group.isOpen === false
                    ? canReadPrivateGroupChat
                      ? 'Closed / private read'
                      : 'Closed / private history unavailable'
                    : 'Open'}
                  {hasPendingJoinTransaction ? ' / join pending' : hasPendingJoinRequest ? ' / request pending' : ''}
                  {typeof selectedChat.group.memberCount === 'number'
                    ? ` / ${selectedChat.group.memberCount.toLocaleString()} members`
                    : ''}
                </p>
              ) : null}
              {selectedChat?.kind === 'direct' ? (
                <p>
                  {canReadPrivateDirectChat ? 'Direct / private history' : 'Direct / send only'} /{' '}
                  {selectedChat.direct.address}
                </p>
              ) : null}
            </div>
            <div className="chat-pane__actions">
              {selectedChat?.kind === 'group' ? (
                <button
                  className="button button--secondary"
                  onClick={() => setMembersOpen((current) => !current)}
                  type="button"
                >
                  {membersOpen ? 'Hide members' : `Members (${groupMembers.value.length})`}
                </button>
              ) : null}
              {selectedChat?.kind === 'group' && selectedGroupId !== null && selectedGroupId > 0 && !isJoinedGroup && canJoinGroup ? (
                <button
                  className="button button--secondary"
                  disabled={!canSubmitJoin}
                  onClick={() => void handleJoinGroup()}
                  title={
                    hasPendingJoinTransaction
                      ? 'Join transaction is pending'
                      : hasPendingJoinRequest
                        ? 'Join request is pending'
                        : canJoinGroup
                          ? 'Join group'
                          : groupJoinUnavailableLabel
                  }
                  type="button"
                >
                  {joinPending
                    ? 'Joining'
                    : hasPendingJoinTransaction
                      ? 'Join pending'
                      : hasPendingJoinRequest
                        ? 'Request pending'
                        : 'Join'}
                </button>
              ) : null}
            </div>
          </div>

          {messages.phase === 'error' ? <p className="error">{messages.error}</p> : null}
          {writeError ? <p className="error">{writeError}</p> : null}
          {accountJoinRequests.phase === 'error' ? <p className="error">{accountJoinRequests.error}</p> : null}
          {adminJoinRequests.phase === 'error' ? <p className="error">{adminJoinRequests.error}</p> : null}
          {selectedDirectHistoryUnavailable ? <p className="muted">{directReadUnavailableLabel}</p> : null}
          {selectedClosedGroupHistoryUnavailable ? (
            <p className="muted">Closed group chat history requires Qortium Home private group chat support.</p>
          ) : null}
          {selectedTransactions.length > 0 ? (
            <div className="tx-status-list" aria-label="Transaction status">
              {selectedTransactions.map((transaction) => (
                <div className={`tx-status tx-status--${transaction.phase}`} key={transaction.id}>
                  <strong>
                    {transaction.phase === 'confirmed'
                      ? 'Confirmed'
                      : transaction.phase === 'failed'
                        ? 'Failed'
                        : 'Pending'}
                  </strong>
                  <span>{transaction.message}</span>
                  {transaction.signature ? <small>{transaction.signature}</small> : null}
                </div>
              ))}
            </div>
          ) : null}

          <MessageList messages={messages.value} />

          <form className="composer" onSubmit={(event) => void handleSendMessage(event)}>
            <input
              aria-label="Message"
              disabled={!canComposeMessage || sendPending}
              maxLength={4000}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Message"
              value={draft}
            />
            <button
              className="button"
              disabled={!canSubmitMessage}
              title={
                selectedChat?.kind === 'direct'
                  ? canSendDirectChat
                    ? 'Send direct message'
                    : directSendUnavailableLabel
                  : canSendGroupChat
                    ? 'Send message'
                    : groupSendUnavailableLabel
              }
              type="submit"
            >
              {sendPending ? 'Sending' : 'Send'}
            </button>
          </form>
        </section>

        {selectedGroup && membersOpen ? (
          <aside className="members-drawer" aria-label="Group members">
            <div className="members-drawer__header">
              <div>
                <h2>Members</h2>
                <p>{getGroupTitle(selectedGroup)}</p>
              </div>
              <span>{groupMembers.value.length}</span>
            </div>
            {groupMembers.phase === 'error' ? <p className="error">{groupMembers.error}</p> : null}
            <GroupMemberList members={groupMembers.value} />
            {selectedAdminJoinRequests.length > 0 ? (
              <div className="join-requests" aria-label="Pending join requests">
                <div className="join-requests__header">
                  <strong>Join requests</strong>
                  <span>{selectedAdminJoinRequests.length}</span>
                </div>
                {selectedAdminJoinRequests.map((request) => (
                  <div className="join-request" key={`${request.groupId}:${request.joiner}`}>
                    <span>{getShortAddress(request.joiner)}</span>
                    <button
                      className="button button--secondary"
                      disabled={!canApproveGroupJoinRequests || approvePendingJoiner === request.joiner}
                      onClick={() => void handleApproveJoinRequest(request)}
                      title={canApproveGroupJoinRequests ? 'Approve join request' : 'Update Qortium Home to approve join requests'}
                      type="button"
                    >
                      {approvePendingJoiner === request.joiner ? 'Approving' : 'Approve'}
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </aside>
        ) : null}
      </section>
    </main>
  );
}
