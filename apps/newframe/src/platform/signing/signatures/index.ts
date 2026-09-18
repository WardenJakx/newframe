import type { EIP712MessageDomain } from '@ledgerhq/types-live'
import type { SignTypedDataVersion, MessageTypeProperty } from '@metamask/eth-sig-util'

import type { TypedMessage, TypedSignatureRequestType } from '../../../features/requests/contract/requests.js'
import signatureTypes from './types.js'

const matchesMsgType = (properties: MessageTypeProperty[], required: MessageTypeProperty[]) =>
  properties.length === required.length &&
  required.every(({ name, type }) =>
    Boolean(properties.find((item) => item.name === name && item.type === type))
  )

const matchesMessage = (message: Record<string, unknown>, required: MessageTypeProperty[]) =>
  required.every(({ name }) => message[name] !== undefined)

const matchesDomainFilter = (domain: EIP712MessageDomain, domainFilter: string[]) =>
  domainFilter.every((property) => property in domain)

export const identify = ({ data }: TypedMessage<SignTypedDataVersion>): TypedSignatureRequestType => {
  const identified = Object.entries(signatureTypes).find(([, { domainFilter, types: requiredTypes }]) => {
    if (!('types' in data && 'message' in data)) {
      return false
    }
    const dataTypes = data.types as Record<string, MessageTypeProperty[] | undefined>

    return Object.entries(requiredTypes).every(
      ([name, properties]) =>
        dataTypes[name] &&
        matchesMsgType(dataTypes[name], properties) &&
        matchesMessage(data.message, properties) &&
        matchesDomainFilter(data.domain as EIP712MessageDomain, domainFilter)
    )
  })

  return identified ? (identified[0] as TypedSignatureRequestType) : 'signTypedData'
}
