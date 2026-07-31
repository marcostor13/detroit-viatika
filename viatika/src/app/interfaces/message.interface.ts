export interface IMessage {
    contactId?: string
    phone: string
    text?: string
    file?: string
    status?: string
    listId?: string
    fileName?: string
    fileType?: string
    createdAt?: Date
    updatedAt?: Date
    publicId?: string
}

export interface IMessageResponse extends IMessage {
    _id: string
}