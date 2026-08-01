import {
  INITIAL_TOKEN_SELECTOR_ROWS,
  TOKEN_SELECTOR_ROWS_INCREMENT
} from '../../shared/ui/tokenSelectorModel'

export const INITIAL_SEND_TOKEN_ROWS = INITIAL_TOKEN_SELECTOR_ROWS
export const SEND_TOKEN_ROWS_INCREMENT = TOKEN_SELECTOR_ROWS_INCREMENT

export interface SendWorkflowState {
  amount: string
  error: string
  recipient: any | null
  recipientInput: string
  recipientOpen: boolean
  selectedAssetKey: string
  tokenOpen: boolean
  tokenRowsVisible: number
}

export type SendWorkflowAction =
  | { type: 'accountChanged'; selectedAssetKey: string }
  | { type: 'clearRecipient' }
  | { type: 'selectAsset'; selectedAssetKey: string }
  | { type: 'selectRecipient'; recipient: any }
  | { type: 'setAmount'; amount: string }
  | { type: 'setMaxAmount'; amount: string }
  | { type: 'setRecipientInput'; recipientInput: string }
  | { type: 'setTokenOpen'; tokenOpen: boolean }
  | { type: 'showMoreTokens' }
  | { type: 'toggleRecipientOpen' }
  | { type: 'validationFailed'; error: string }

export function createInitialSendState(assetId?: string | null): SendWorkflowState {
  return {
    amount: '1',
    error: '',
    recipient: null,
    recipientInput: '',
    recipientOpen: true,
    selectedAssetKey: assetId || '',
    tokenOpen: false,
    tokenRowsVisible: INITIAL_SEND_TOKEN_ROWS
  }
}

export function sendReducer(state: SendWorkflowState, action: SendWorkflowAction): SendWorkflowState {
  switch (action.type) {
    case 'accountChanged':
      return {
        ...state,
        amount: '',
        error: '',
        recipient: null,
        recipientInput: '',
        recipientOpen: true,
        selectedAssetKey: action.selectedAssetKey,
        tokenOpen: false,
        tokenRowsVisible: INITIAL_SEND_TOKEN_ROWS
      }
    case 'clearRecipient':
      return {
        ...state,
        recipient: null,
        recipientInput: '',
        recipientOpen: true
      }
    case 'selectAsset':
      return {
        ...state,
        error: '',
        selectedAssetKey: action.selectedAssetKey,
        tokenOpen: false
      }
    case 'selectRecipient':
      return {
        ...state,
        error: '',
        recipient: action.recipient,
        recipientInput: '',
        recipientOpen: false
      }
    case 'setAmount':
      return {
        ...state,
        amount: action.amount,
        error: ''
      }
    case 'setMaxAmount':
      return {
        ...state,
        amount: action.amount,
        error: ''
      }
    case 'setRecipientInput':
      return {
        ...state,
        error: '',
        recipientInput: action.recipientInput,
        recipientOpen: true
      }
    case 'setTokenOpen':
      return {
        ...state,
        recipientOpen: action.tokenOpen ? false : state.recipientOpen,
        tokenOpen: action.tokenOpen
      }
    case 'showMoreTokens':
      return {
        ...state,
        tokenRowsVisible: state.tokenRowsVisible + SEND_TOKEN_ROWS_INCREMENT
      }
    case 'toggleRecipientOpen':
      return {
        ...state,
        recipientOpen: !state.recipientOpen
      }
    case 'validationFailed':
      return {
        ...state,
        error: action.error
      }
    default:
      return state
  }
}
